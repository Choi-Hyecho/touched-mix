import { Howl, Howler } from "howler";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SYNC_INTERVAL_MS = 400;
/** 주기 보정: Web Audio reported pos vs 비디오 — 너무 촘촘하면 seek 스팸으로 Howler 위치 튐 */
const SYNC_DRIFT_SEC = 0.38;
const SYNC_SEEK_THROTTLE_MS = 600;
/** timeupdate hardSync: reported pos가 vt보다 ~0.33초만 밀려도 0.3이면 무한 보정 — 약간 느슨하게 */
const TIMEUPDATE_DRIFT_SYNC_SEC = 0.52;
const TIMEUPDATE_DRIFT_THROTTLE_MS = 95;
/** timeupdate hardSync 최소 간격 — 연속 seek로 0초 튐 방지 */
const TIMEUPDATE_HARD_SYNC_MIN_MS = 750;
/** 재생 중 hardSync / 주기 보정 시에만 — Web Audio 출력 지연 보정(초). 시크·시작·URL 스냅샷 seek에는 넣지 않음 */
const WEB_AUDIO_SYNC_LEAD_SEC = 0.06;
const DEFAULT_TRACK_VOLUME = 0.8;

/** 트랙별 순차 로딩 중 표시할 이스터에그 문구 (track.id → 문구) */
const TRACK_LOAD_MESSAGES = {
  vocal1: "윤민이 마이크에 츠츠츠 중…🎤",
  vocal2: "오빠들 코러스 쌓는 중…🎵",
  inst:   "세트 리스트 부착 중…📃",
  piano:  "도현이 키보드 세팅 중…🎹",
  string: "승빈이 마이크 위치 조정 중…🎙️",
  guitar: "윤민이가 마이크 스탠드에 피크 끼우는 중…🎤",
  bass:   "비킴이 피크 찾는 중…🫶",
  drum:   "승빈이 스네어 튜닝 중…🥁",
};

/** Web Audio 디코딩·네트워크 여유 — LTE 등 느린 망에서 순차 로딩 시 충분히 기다림 */
const AUDIO_LOAD_TIMEOUT_MS = 90000;
/** 재생 직후 끊김 완화: 시작 구간 최소 버퍼(초) — LTE 등 느린 망에서 시작 직후 버벅임 방지 */
const VIDEO_MIN_BUFFER_SEC = 2.0;
/** 비디오+오디오 조건 충족 후 짧은 안정화 시간 뒤 UI 해제 */
const PRELOAD_SETTLE_MS = 500;
/** video ref 바인딩 폴링 타임아웃 */
const VIDEO_BIND_TIMEOUT_MS = 15000;
/** 그래도 비디오가 안 되면 완화 조건으로 진입(ms) */
const VIDEO_RELAXED_READY_AFTER_MS = 24000;

Howler.autoUnlock = false;

/** 카카오톡·라인 등 인앱 브라우저 및 Android WebView는 Web Audio decodeAudioData 미지원 케이스 있음
 *  → html5: true 로 폴백해 로딩 오류 방지. 싱크 오차는 드리프트 보정이 커버. */
const USE_HTML5_AUDIO = (() => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /KAKAOTALK|Line\/|Instagram|NAVER|DaumApps|FB_IAB|FBAN|FBAV/i.test(ua)
    || (/Android/i.test(ua) && /wv\b|WebView/i.test(ua));
})();

/** 비디오 마스터 시각 + 선행(lead). duration 안에서만 클램프 */
function getSyncTargetTime(video, leadSec = 0) {
  if (!video) return 0;
  const raw = video.currentTime;
  if (!Number.isFinite(raw)) return 0;
  const lead = Number(leadSec) || 0;
  const dur = video.duration;
  let t = Math.max(0, raw + lead);
  if (Number.isFinite(dur) && dur > 0.1) {
    t = Math.min(t, Math.max(0, dur - 0.02));
  }
  return t;
}

/**
 * 재생 시작·재개 시 Howl seek에 쓸 비디오 시각.
 * 일부 환경에서 play 직후 `currentTime`이 잠깐 0에 가깝게 남거나 한 박자 늦게 갱신되어
 * 화면은 12초인데 소리만 0초부터 나는 현상이 난다. timeupdate/seek로 쌓인 trusted와 max로 맞춘다.
 */
function mergeVideoTimeForSlaveSync(rawCurrentTime, lastTrustedVideoTime) {
  const r = Number.isFinite(rawCurrentTime)
    ? Math.max(0, rawCurrentTime)
    : NaN;
  const tr = Number.isFinite(lastTrustedVideoTime)
    ? Math.max(0, lastTrustedVideoTime)
    : NaN;
  if (!Number.isNaN(r) && !Number.isNaN(tr)) {
    return Math.max(r, tr);
  }
  if (!Number.isNaN(r)) return r;
  if (!Number.isNaN(tr)) return tr;
  return 0;
}

/** 개발 빌드에서만 — 공유 링크·재생바 시크 시 음원 동기화 디버깅 (콘솔 필터: audio-sync) */
const DEBUG_AUDIO_SYNC = import.meta.env.DEV;

function logAudioSync(phase, data) {
  if (!DEBUG_AUDIO_SYNC) return;
  console.log(`[audio-sync] ${phase}`, { ...data, _ts: Date.now() });
}

/** 첫 번째 Howl의 seek() 반환값(대표 샘플) */
function getFirstHowlReportedPos(map) {
  const h = map.values().next().value;
  if (!h) return null;
  try {
    return h.seek();
  } catch {
    return null;
  }
}

/**
 * 스템(m4a) 실제 길이 안에서만 seek. 영상이 더 길면 1분 넘겨 스크럽 시 Howl이 끝을 넘겨 0초로 돌아가는 등 깨짐.
 */
function clampSeekToHowlDuration(howl, seconds) {
  const t = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  let dur = 0;
  try {
    dur = howl.duration();
  } catch {
    return t;
  }
  if (!Number.isFinite(dur) || dur <= 0.05) return t;
  return Math.min(t, Math.max(0, dur - 0.02));
}

/** seek 설정 전용 — 읽기용 howl.seek()는 부르지 말 것 */
function seekHowlSeconds(howl, seconds, logLabel) {
  const requested = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const clamped = clampSeekToHowlDuration(howl, requested);
  if (DEBUG_AUDIO_SYNC && clamped + 0.08 < requested) {
    let dur = 0;
    try {
      dur = howl.duration();
    } catch {
      /* noop */
    }
    console.warn(
      `[audio-sync] stem seek clamped (${logLabel}) — 스템이 영상 위치보다 짧음`,
      {
        requestedSec: requested,
        usedSec: clamped,
        stemDurationSec: dur,
      }
    );
  }
  try {
    howl.seek(clamped);
  } catch {
    /* noop */
  }
}

function getFirstRangeBufferedSeconds(video) {
  try {
    if (!video.buffered?.length) return 0;
    return Math.max(0, video.buffered.end(0) - video.buffered.start(0));
  } catch {
    return 0;
  }
}

/** HAVE_FUTURE_DATA 이상 + 시작 구간 버퍼가 어느 정도 쌓였을 때만 true */
function isVideoPrimedForPlayback(video) {
  if (!video || video.error) return false;
  if (video.readyState >= 4) return true;
  if (video.readyState < 3) return false;
  const dur = video.duration;
  if (!dur || !isFinite(dur) || dur <= 0) return false;
  const buf = getFirstRangeBufferedSeconds(video);
  const need = Math.min(VIDEO_MIN_BUFFER_SEC, Math.max(0.35, dur * 0.05));
  return buf >= need;
}

/**
 * 곡(songId)이 바뀌면 해당 곡의 비디오·오디오만 프리로드합니다.
 * Master: video — Slave: Howl. `start()`는 프리로드 완료 후 호출합니다.
 *
 * @param {object} options
 * @param {string} options.songId
 * @param {Array<{ id: string, urls: string[] }>} options.tracks
 * @param {React.RefObject<HTMLVideoElement | null>} options.videoRef
 */
export function useMultiAudio({ songId, tracks = [], videoRef }) {
  const tracksKey = useMemo(
    () => tracks.map((t) => `${t.id}:${(t.urls ?? []).join(",")}`).join("|"),
    [tracks]
  );

  const [started, setStarted] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [loadStatus, setLoadStatus] = useState("");
  const [preloadKey, setPreloadKey] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mutedTracks, setMutedTracks] = useState(() => ({}));
  const [trackVolumes, setTrackVolumes] = useState(() => ({}));

  const howlsRef = useRef(new Map());
  const mutedRef = useRef(new Map());
  const volumesRef = useRef(new Map());

  const syncIntervalRef = useRef(0);
  const startingRef = useRef(false);
  const startedRef = useRef(false);
  const preloadGenRef = useRef(0);
  const mediaReadyRef = useRef(false);
  const videoReadyRef = useRef(false);
  const audioReadyIdsRef = useRef(new Set());
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const lastSeekAtRef = useRef(new Map());
  const timeUpdateDriftAtRef = useRef(0);
  const lastTimeupdateHardSyncAtRef = useRef(0);
  /** onPlay 스태거 구간에서 timeupdate 보정 오판 방지 */
  const skipTimeDriftSyncUntilRef = useRef(0);
  /** timeupdate/seeked 기준 — play 이벤트 직후 currentTime이 잠깐 0으로 남는 경우 보정 */
  const lastTrustedVideoTimeRef = useRef(0);
  const isSeekingRef = useRef(false);
  /** seeking 동안 마지막 스크럽 위치 — seeked 직후 currentTime이 0으로 남는 경우 보조 */
  const lastScrubVideoTimeRef = useRef(0);
  /** DEBUG: seeking 로그 스팸 방지 */
  const audioSyncSeekingLogAtRef = useRef(0);
  /** 동일 프레임에 play 리스너가 두 번 도는 경우 디바운스 */
  const lastPlayStaggerWallMsRef = useRef(0);
  const mediaReadySettleTimerRef = useRef(0);
  /** waiting 이벤트가 실제로 발생했을 때만 playing에서 재싱크 — 일반 재생 시 이중 트리거 방지 */
  const isBufferingRef = useRef(false);
  /**
   * howl.seek() 읽기가 이 환경에서 마지막 seek 위치를 그대로 반환하는 버그를 우회.
   * wall-clock 기반으로 예상 재생 위치를 추적해 drift 감지에 사용한다.
   */
  const stemClockRef = useRef({ startMs: 0, startPos: 0, running: false });

  const clearSyncInterval = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = 0;
    }
  }, []);

  const disposeHowls = useCallback(() => {
    clearSyncInterval();
    // ref를 먼저 비워 새 곡 Howl과 충돌 방지
    const toDispose = howlsRef.current;
    howlsRef.current = new Map();

    // 재생 중인 Howl은 80ms 페이드아웃 후 stop — 파형 급절단(클릭/팝 노이즈) 방지
    toDispose.forEach((howl) => {
      try {
        const vol = howl.volume();
        if (vol > 0) {
          howl.fade(vol, 0, 80);
        }
      } catch {
        /* noop */
      }
    });
    window.setTimeout(() => {
      toDispose.forEach((howl) => {
        try {
          howl.stop();
          howl.unload();
        } catch {
          /* noop */
        }
      });
    }, 100);

    // 분석/네온 미터 상태도 같이 초기화
  }, [clearSyncInterval]);

  /** @param {{ leadSec?: number }} [opts] — 재생 중 드리프트 보정 시 `leadSec: WEB_AUDIO_SYNC_LEAD_SEC` */
  const hardSyncSlavesToMaster = useCallback((opts = {}) => {
    const video = videoRef?.current;
    if (!video) return;
    const lead =
      typeof opts.leadSec === "number" ? opts.leadSec : 0;
    const targetT = getSyncTargetTime(video, lead);
    howlsRef.current.forEach((howl) => {
      seekHowlSeconds(howl, targetT, "hardSync");
    });
  }, [videoRef]);

  /** 시크 완료 후: Web Audio에서 seek만으로 부족할 때 pause→seek→(재생 중이면)play */
  const resyncHowlsAfterVideoSeek = useCallback((overrideSeconds) => {
    const video = videoRef?.current;
    if (!video) return;
    const t =
      typeof overrideSeconds === "number" && Number.isFinite(overrideSeconds)
        ? Math.max(0, overrideSeconds)
        : Math.max(0, video.currentTime);
    const resume = !video.paused;
    howlsRef.current.forEach((howl) => {
      try {
        howl.pause();
        seekHowlSeconds(howl, t, "resync");
        if (resume) howl.play();
      } catch {
        /* noop */
      }
    });
    stemClockRef.current = { startMs: Date.now(), startPos: t, running: resume };
    // seeked에서 이미 resume 처리했으면 onPlaying의 이중 play 방지
    if (resume) isBufferingRef.current = false;
  }, [videoRef]);

  const runPeriodicDriftCorrection = useCallback(() => {
    const video = videoRef?.current;
    if (!video || video.paused) return;
    const t = video.currentTime;
    const targetSync = getSyncTargetTime(video, WEB_AUDIO_SYNC_LEAD_SEC);

    // howl.seek() 읽기가 last-set 값을 반환하는 환경 버그 우회: wall-clock 추정치로 drift 감지
    const sc = stemClockRef.current;
    const stemPos = sc.running
      ? sc.startPos + (Date.now() - sc.startMs) / 1000
      : sc.startPos;
    const drift = Math.abs(stemPos - t);
    if (drift < SYNC_DRIFT_SEC) return;

    const now = Date.now();
    const firstHowl = howlsRef.current.values().next().value;
    const last = firstHowl ? (lastSeekAtRef.current.get(firstHowl) ?? 0) : 0;
    // 큰 어긋남(시크 직후 등)은 스로틀 없이 바로 맞춤
    if (drift < 1 && now - last < SYNC_SEEK_THROTTLE_MS) return;

    howlsRef.current.forEach((howl) => {
      lastSeekAtRef.current.set(howl, now);
      seekHowlSeconds(howl, targetSync, "periodic");
    });
    stemClockRef.current = { startMs: now, startPos: targetSync, running: true };
  }, [videoRef]);

  const recalcLoadProgress = useCallback(() => {
    const list = tracksRef.current;
    const n = Math.max(1, 1 + list.length);
    const w = 100 / n;
    let p = 0;

    if (videoReadyRef.current) {
      p += w;
    } else {
      const v = videoRef?.current;
      if (v?.duration > 0 && v.buffered?.length) {
        try {
          const end = v.buffered.end(v.buffered.length - 1);
          p += w * Math.min(1, end / v.duration);
        } catch {
          /* noop */
        }
      }
    }

    list.forEach((t) => {
      if (audioReadyIdsRef.current.has(t.id)) p += w;
    });

    setLoadProgress(Math.min(100, Math.round(p)));
  }, [videoRef]);

  const tryMarkMediaReady = useCallback((gen) => {
    if (gen !== preloadGenRef.current) return;
    const list = tracksRef.current;
    const videoOk = videoReadyRef.current;
    const audioOk =
      list.length === 0 ||
      (howlsRef.current.size === list.length &&
        list.every((t) => audioReadyIdsRef.current.has(t.id)));
    if (!videoOk || !audioOk) return;

    if (mediaReadySettleTimerRef.current) {
      window.clearTimeout(mediaReadySettleTimerRef.current);
      mediaReadySettleTimerRef.current = 0;
    }
    setLoadStatus("윤민이 물 마시는 중...💧");
    mediaReadySettleTimerRef.current = window.setTimeout(() => {
      mediaReadySettleTimerRef.current = 0;
      if (gen !== preloadGenRef.current) return;
      const listNow = tracksRef.current;
      const vOk = videoReadyRef.current;
      const aOk =
        listNow.length === 0 ||
        (howlsRef.current.size === listNow.length &&
          listNow.every((t) => audioReadyIdsRef.current.has(t.id)));
      if (vOk && aOk) {
        setLoadProgress(100);
        setLoadStatus("준비 완료");
        mediaReadyRef.current = true;
        setMediaReady(true);
      }
    }, PRELOAD_SETTLE_MS);
  }, []);

  useEffect(() => {
    const gen = ++preloadGenRef.current;
    if (mediaReadySettleTimerRef.current) {
      window.clearTimeout(mediaReadySettleTimerRef.current);
      mediaReadySettleTimerRef.current = 0;
    }
    videoReadyRef.current = false;
    audioReadyIdsRef.current = new Set();
    mediaReadyRef.current = false;
    setMediaReady(false);
    setLoadProgress(0);
    setLoadError(null);
    setLoadStatus("승빈이 드럼 스틱 꺼내는 중…🥁");
    startedRef.current = false;
    setStarted(false);
    clearSyncInterval();
    disposeHowls();
    mutedRef.current.clear();
    volumesRef.current.clear();
    setMutedTracks({});
    setTrackVolumes({});
    lastTrustedVideoTimeRef.current = 0;
    lastScrubVideoTimeRef.current = 0;
    isSeekingRef.current = false;
    lastPlayStaggerWallMsRef.current = 0;
    lastTimeupdateHardSyncAtRef.current = 0;
    stemClockRef.current = { startMs: 0, startPos: 0, running: false };

    const list = tracksRef.current;

    howlsRef.current = new Map();

    // 초기 볼륨 상태(0.8) 세팅
    const initialVolumes = {};
    list.forEach((t) => {
      initialVolumes[t.id] = DEFAULT_TRACK_VOLUME;
    });
    setTrackVolumes(initialVolumes);

    // 순차 로딩: 이전 트랙 완료 후 다음 트랙 생성 — LTE 대역폭 경합 방지
    const loadTrackAt = (index) => {
      if (gen !== preloadGenRef.current) return;
      if (index >= list.length) return;

      const track = list[index];
      setLoadStatus(TRACK_LOAD_MESSAGES[track.id] ?? `${track.id} 준비 중…`);

      const howl = new Howl({
        src: track.urls,
        preload: true,
        // 인앱 브라우저·WebView는 Web Audio decodeAudioData 실패 케이스 있어 html5 폴백
        html5: USE_HTML5_AUDIO,
      });
      // 기본 볼륨(0.8) 적용. mute는 별도로 처리.
      try {
        howl.volume(DEFAULT_TRACK_VOLUME);
      } catch {
        /* noop */
      }
      volumesRef.current.set(track.id, DEFAULT_TRACK_VOLUME);
      howlsRef.current.set(track.id, howl);

      const loadTimeoutId = window.setTimeout(() => {
        if (gen !== preloadGenRef.current) return;
        setLoadError(`오디오 트랙을 불러오지 못했습니다. (${track.id})`);
      }, AUDIO_LOAD_TIMEOUT_MS);

      howl.once("load", () => {
        if (gen !== preloadGenRef.current) return;
        window.clearTimeout(loadTimeoutId);
        audioReadyIdsRef.current.add(track.id);
        recalcLoadProgress();
        tryMarkMediaReady(gen);
        loadTrackAt(index + 1); // 다음 트랙 로드 시작
      });
      howl.once("loaderror", () => {
        if (gen !== preloadGenRef.current) return;
        window.clearTimeout(loadTimeoutId);
        setLoadError(`오디오 트랙을 불러오지 못했습니다. (${track.id})`);
      });
    };

    loadTrackAt(0);

    const bindVideo = (video) => {
      const markVideoReady = () => {
        if (videoReadyRef.current) return;
        videoReadyRef.current = true;
        setLoadStatus("윤민이 손목에 스카프 묶는 중...✨");
      };

      const tryMarkVideoReady = () => {
        if (videoReadyRef.current) return;
        if (isVideoPrimedForPlayback(video)) {
          markVideoReady();
        }
      };

      const onVideoProgress = () => {
        if (gen !== preloadGenRef.current) return;
        setLoadStatus("비킴이 베이스 스트랩 연결 중…🐻‍❄️");
        tryMarkVideoReady();
        recalcLoadProgress();
        tryMarkMediaReady(gen);
      };

      const onVideoCanPlay = () => {
        if (gen !== preloadGenRef.current) return;
        tryMarkVideoReady();
        recalcLoadProgress();
        tryMarkMediaReady(gen);
      };

      const onVideoCanPlayThrough = () => {
        if (gen !== preloadGenRef.current) return;
        markVideoReady();
        recalcLoadProgress();
        tryMarkMediaReady(gen);
      };

      const onVideoLoadedMetadata = () => {
        if (gen !== preloadGenRef.current) return;
        setLoadStatus("도현이 맥북 켜는 중…👨‍💻");
        tryMarkVideoReady();
        recalcLoadProgress();
        tryMarkMediaReady(gen);
      };

      const onVideoLoadedData = () => {
        if (gen !== preloadGenRef.current) return;
        setLoadStatus("비디오 데이터 로딩…");
        tryMarkVideoReady();
        recalcLoadProgress();
        tryMarkMediaReady(gen);
      };

      const onVideoError = () => {
        if (gen !== preloadGenRef.current) return;
        const code = video.error?.code ?? "?";
        const msg = video.error?.message ?? "";
        setLoadError(`비디오 오류 (code: ${code}${msg ? " / " + msg : ""})`);
      };

      video.addEventListener("progress", onVideoProgress);
      video.addEventListener("loadedmetadata", onVideoLoadedMetadata);
      video.addEventListener("loadeddata", onVideoLoadedData);
      video.addEventListener("canplay", onVideoCanPlay);
      video.addEventListener("canplaythrough", onVideoCanPlayThrough);
      video.addEventListener("error", onVideoError);

      if (video.readyState >= 3) {
        tryMarkVideoReady();
      }
      tryMarkVideoReady();

      /** Safari(iOS) 대응: 사용자 상호작용 없이는 preload를 안 해 readyState가 1에 머묾.
       *  duration이 확인된 시점(metadata 있음)이면 재생 시작 가능으로 간주 */
      const safariRelaxedId = window.setTimeout(() => {
        if (gen !== preloadGenRef.current) return;
        if (videoReadyRef.current) return;
        try {
          const dur = video.duration;
          if (video.readyState >= 1 && Number.isFinite(dur) && dur > 0) {
            markVideoReady();
            recalcLoadProgress();
            tryMarkMediaReady(gen);
          }
        } catch {
          /* noop */
        }
      }, 5000);

      const relaxedId = window.setTimeout(() => {
        if (gen !== preloadGenRef.current) return;
        if (videoReadyRef.current) return;
        try {
          const dur = video.duration;
          const buf = getFirstRangeBufferedSeconds(video);
          if (video.readyState >= 1 && Number.isFinite(dur) && dur > 0 && buf >= 0) {
            markVideoReady();
            recalcLoadProgress();
            tryMarkMediaReady(gen);
          }
        } catch {
          /* noop */
        }
      }, VIDEO_RELAXED_READY_AFTER_MS);

      recalcLoadProgress();
      tryMarkMediaReady(gen);

      return () => {
        window.clearTimeout(safariRelaxedId);
        window.clearTimeout(relaxedId);
        video.removeEventListener("progress", onVideoProgress);
        video.removeEventListener("loadedmetadata", onVideoLoadedMetadata);
        video.removeEventListener("loadeddata", onVideoLoadedData);
        video.removeEventListener("canplay", onVideoCanPlay);
        video.removeEventListener("canplaythrough", onVideoCanPlayThrough);
        video.removeEventListener("error", onVideoError);
      };
    };

    let videoCleanup = () => {};
    let videoBound = false;
    let pollId = null;

    const tryBindVideo = () => {
      if (gen !== preloadGenRef.current || videoBound) return true;
      const video = videoRef?.current;
      if (!video) return false;
      videoCleanup = bindVideo(video);
      videoBound = true;
      return true;
    };

    recalcLoadProgress();
    if (!tryBindVideo()) {
      const pollStart = Date.now();
      pollId = window.setInterval(() => {
        if (gen !== preloadGenRef.current) {
          if (pollId != null) {
            window.clearInterval(pollId);
            pollId = null;
          }
          return;
        }
        if (tryBindVideo() && pollId != null) {
          window.clearInterval(pollId);
          pollId = null;
          return;
        }
        if (Date.now() - pollStart > VIDEO_BIND_TIMEOUT_MS && pollId != null) {
          window.clearInterval(pollId);
          pollId = null;
          if (gen === preloadGenRef.current) {
            setLoadError("비디오를 준비하는 데 시간이 오래 걸립니다. 새로고침 후 다시 시도해 주세요.");
          }
        }
      }, 50);
    }

    return () => {
      if (mediaReadySettleTimerRef.current) {
        window.clearTimeout(mediaReadySettleTimerRef.current);
        mediaReadySettleTimerRef.current = 0;
      }
      if (pollId != null) {
        window.clearInterval(pollId);
        pollId = null;
      }
      videoCleanup();
      if (gen === preloadGenRef.current) {
        disposeHowls();
      }
    };
  }, [
    songId,
    tracksKey,
    preloadKey,
    videoRef,
    disposeHowls,
    clearSyncInterval,
    recalcLoadProgress,
    tryMarkMediaReady,
  ]);

  const start = useCallback(() => {
    if (startingRef.current || startedRef.current) {
      return Promise.resolve();
    }
    if (!mediaReady) return Promise.resolve();

    const video = videoRef?.current;
    if (!video) return Promise.resolve();

    const list = tracksRef.current;
    if (list.length > 0 && howlsRef.current.size !== list.length) {
      return Promise.resolve();
    }

    startingRef.current = true;

    const run = async () => {
      const rawT = video.currentTime;
      const t = mergeVideoTimeForSlaveSync(
        rawT,
        lastTrustedVideoTimeRef.current
      );
      lastTrustedVideoTimeRef.current = t;

      // AudioContext resume 전에 먼저 음소거+seek — resume 순간 버퍼가 새어나오는 팝 노이즈 방지
      howlsRef.current.forEach((howl) => {
        try {
          howl.mute(true);
          seekHowlSeconds(howl, t, "start-pre-resume");
        } catch {
          /* noop */
        }
      });

      if (Howler.ctx) {
        try {
          await Howler.ctx.resume();
        } catch {
          /* noop */
        }
      }

      // resume 완료 후 실제 뮤트 상태 적용
      const initialMuted = {};
      howlsRef.current.forEach((howl, id) => {
        seekHowlSeconds(howl, t, "start");
        const m = mutedRef.current.get(id) === true;
        howl.mute(m);
        const v = volumesRef.current.get(id);
        if (typeof v === "number") {
          try {
            howl.volume(v);
          } catch {
            /* noop */
          }
        }
        initialMuted[id] = m;
      });
      setMutedTracks(initialMuted);

      startedRef.current = true;
      setStarted(true);
    };

    return run().finally(() => {
      startingRef.current = false;
    });
  }, [mediaReady, videoRef]);

  const setTrackMuted = useCallback((trackId, muted) => {
    const next = Boolean(muted);
    mutedRef.current.set(trackId, next);
    const howl = howlsRef.current.get(trackId);
    if (howl) howl.mute(next);
    setMutedTracks((prev) => ({ ...prev, [trackId]: next }));
  }, []);

  const setTrackVolume = useCallback((trackId, volume) => {
    const next = Math.min(1, Math.max(0, Number(volume)));
    volumesRef.current.set(trackId, next);
    const howl = howlsRef.current.get(trackId);
    if (howl) {
      try {
        howl.volume(next);
      } catch {
        /* noop */
      }
    }
    setTrackVolumes((prev) => ({ ...prev, [trackId]: next }));
  }, []);

  const resetMix = useCallback(() => {
    const list = tracksRef.current;
    const nextMuted = {};
    const nextVolumes = {};
    list.forEach((t) => {
      nextMuted[t.id] = false;
      nextVolumes[t.id] = DEFAULT_TRACK_VOLUME;
      mutedRef.current.set(t.id, false);
      volumesRef.current.set(t.id, DEFAULT_TRACK_VOLUME);
      const howl = howlsRef.current.get(t.id);
      if (howl) {
        try {
          howl.mute(false);
          howl.volume(DEFAULT_TRACK_VOLUME);
        } catch {
          /* noop */
        }
      }
    });
    setMutedTracks(nextMuted);
    setTrackVolumes(nextVolumes);
  }, []);

  /** URL 공유 등: 현재 곡 트랙에 대해 뮤트·볼륨을 한 번에 반영 (재생 위치는 항상 비디오에 맞춤) */
  const applyMixSnapshot = useCallback((mutedObj, volumesObj) => {
    const list = tracksRef.current;
    const video = videoRef?.current;
    const vt =
      video && Number.isFinite(video.currentTime)
        ? Math.max(0, video.currentTime)
        : 0;
    const nextMuted = {};
    const nextVolumes = {};
    list.forEach((track) => {
      const id = track.id;
      const m = mutedObj[id] === true;
      const vol = Math.min(
        1,
        Math.max(0, Number(volumesObj[id] ?? DEFAULT_TRACK_VOLUME))
      );
      nextMuted[id] = m;
      nextVolumes[id] = vol;
      mutedRef.current.set(id, m);
      volumesRef.current.set(id, vol);
      const howl = howlsRef.current.get(id);
      if (howl) {
        try {
          howl.mute(m);
          howl.volume(vol);
          seekHowlSeconds(howl, vt, "applyMixSnapshot");
        } catch {
          /* noop */
        }
      }
    });
    setMutedTracks(nextMuted);
    setTrackVolumes(nextVolumes);
    lastTrustedVideoTimeRef.current = vt;
    logAudioSync("applyMixSnapshot(URL 공유 프리셋)", {
      seekToVideoT: vt,
      howlPosSample: getFirstHowlReportedPos(howlsRef.current),
    });
  }, [videoRef]);

  const resetSession = useCallback(() => {
    preloadGenRef.current++;
    startingRef.current = false;
    startedRef.current = false;
    clearSyncInterval();
    disposeHowls();
    mutedRef.current.clear();
    setStarted(false);
    setMutedTracks({});
    mediaReadyRef.current = false;
    setMediaReady(false);
    setLoadProgress(0);
    setLoadError(null);
    setPreloadKey((k) => k + 1);
  }, [disposeHowls, clearSyncInterval]);

  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  useEffect(() => {
    if (!started) return;

    const video = videoRef?.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      const howlList = Array.from(howlsRef.current.values());
      skipTimeDriftSyncUntilRef.current =
        Date.now() + howlList.length * 30 + 140;

      /**
       * play가 seeked보다 먼저 오면 currentTime이 잠깐 0인 브라우저가 있음(공유 링크 첫 세션 등).
       * rVFC + lastTrusted 보정으로 실제 재생 위치를 쓴다.
       */
      const runSyncedStemPlay = () => {
        const v = videoRef?.current;
        if (!v) return;

        const wall = Date.now();
        if (wall - lastPlayStaggerWallMsRef.current < 72) {
          logAudioSync("video-play → skip duplicate runSyncedStemPlay", {
            deltaMs: wall - lastPlayStaggerWallMsRef.current,
          });
          return;
        }
        lastPlayStaggerWallMsRef.current = wall;

        // play 이벤트가 seeked보다 먼저 오는 브라우저: 시크 중에는 스태거 금지 → seeked에서 resyncHowlsAfterVideoSeek
        if (isSeekingRef.current) {
          logAudioSync("video-play → skip stagger (seeking; seeked will resync)", {
            videoT: v.currentTime,
          });
          return;
        }

        const raw = v.currentTime;
        const trusted = lastTrustedVideoTimeRef.current;
        let t = mergeVideoTimeForSlaveSync(raw, trusted);
        if (!Number.isFinite(t) || t < 0) t = 0;
        lastTrustedVideoTimeRef.current = t;

        const howls = Array.from(howlsRef.current.values());
        const usedTrustedFix =
          Number.isFinite(raw) &&
          Number.isFinite(trusted) &&
          trusted > raw + 0.05;

        logAudioSync("video-play → runSyncedStemPlay", {
          rawCurrentTime: raw,
          lastTrustedVideoTime: trusted,
          finalSeekT: t,
          usedTrustedFix,
          isSeeking: isSeekingRef.current,
          howlCount: howls.length,
          videoPaused: v.paused,
        });

        /* 트랙별 setTimeout 스태거는 각 스템이 같은 t에서 시작해야 하는데 wall 시간이 달라져
         * 앞선 트랙만 재생이 진행된 채 뒤 트랙이 늦게 붙는(트랙끼리 싱크 붕괴) 원인이 됨 — 항상 동시 seek+play */
        howls.forEach((howl, idx) => {
          try {
            howl.pause();
            seekHowlSeconds(howl, t, "play");
            howl.play();
            if (idx === howls.length - 1) {
              logAudioSync("all howls seek+play done", {
                finalSeekT: t,
                howlPosSample: getFirstHowlReportedPos(howlsRef.current),
                videoT: videoRef?.current?.currentTime,
              });
            }
          } catch {
            /* noop */
          }
        });
        stemClockRef.current = { startMs: Date.now(), startPos: t, running: true };
      };

      const v0 = videoRef?.current;
      if (v0 && typeof v0.requestVideoFrameCallback === "function") {
        v0.requestVideoFrameCallback(() => {
          requestAnimationFrame(runSyncedStemPlay);
        });
      } else {
        requestAnimationFrame(() => {
          requestAnimationFrame(runSyncedStemPlay);
        });
      }

      clearSyncInterval();
      syncIntervalRef.current = window.setInterval(
        runPeriodicDriftCorrection,
        SYNC_INTERVAL_MS
      );
    };

    const onPause = () => {
      const vp = videoRef?.current;
      if (vp && Number.isFinite(vp.currentTime)) {
        const t = Math.max(0, vp.currentTime);
        // pause 직후 currentTime이 잠깐 0으로 보이는 브라우저 대응 — 이미 신뢰된 값보다 뒤로 역행하지 않음
        if (t > 0 || lastTrustedVideoTimeRef.current === 0) {
          lastTrustedVideoTimeRef.current = t;
        }
      }
      logAudioSync("video-pause", {
        videoT: videoRef?.current?.currentTime,
        lastTrustedAfterPause: lastTrustedVideoTimeRef.current,
        howlPosSample: getFirstHowlReportedPos(howlsRef.current),
      });
      setIsPlaying(false);
      clearSyncInterval();
      howlsRef.current.forEach((howl) => howl.pause());
      const scPause = stemClockRef.current;
      stemClockRef.current = {
        startMs: Date.now(),
        startPos: scPause.running
          ? scPause.startPos + (Date.now() - scPause.startMs) / 1000
          : scPause.startPos,
        running: false,
      };
    };

    /** LTE 등 버퍼링 시작: 비디오 멈추는 동안 오디오도 같이 멈춤 */
    const onWaiting = () => {
      isBufferingRef.current = true;
      clearSyncInterval();
      howlsRef.current.forEach((howl) => {
        try { howl.pause(); } catch { /* noop */ }
      });
      const scWait = stemClockRef.current;
      stemClockRef.current = {
        startMs: Date.now(),
        startPos: scWait.running
          ? scWait.startPos + (Date.now() - scWait.startMs) / 1000
          : scWait.startPos,
        running: false,
      };
      logAudioSync("video-waiting (buffering) → audio paused", {
        videoT: video.currentTime,
      });
    };

    /** 버퍼링 끝나고 재개: waiting이 선행됐을 때만 재싱크 — 일반 play와 이중 트리거 방지 */
    const onPlaying = () => {
      if (!isBufferingRef.current) return;
      isBufferingRef.current = false;
      const v = videoRef?.current;
      if (!v || v.paused) return;
      const t = getSyncTargetTime(v, 0);
      lastTrustedVideoTimeRef.current = t;
      howlsRef.current.forEach((howl) => {
        try {
          seekHowlSeconds(howl, t, "playing-resync");
          howl.play();
        } catch { /* noop */ }
      });
      stemClockRef.current = { startMs: Date.now(), startPos: t, running: true };
      skipTimeDriftSyncUntilRef.current = Date.now() + 300;
      clearSyncInterval();
      syncIntervalRef.current = window.setInterval(runPeriodicDriftCorrection, SYNC_INTERVAL_MS);
      logAudioSync("video-playing (buffering end) → audio resynced", {
        videoT: v.currentTime,
        seekTo: t,
      });
    };

    const onSeeking = () => {
      isSeekingRef.current = true;
      const v = videoRef?.current;
      const t = v ? Math.max(0, v.currentTime) : 0;
      lastScrubVideoTimeRef.current = t;
      // 스크럽 중에는 예전 구간 소리가 나오지 않게 먼저 멈추고 타임라인만 맞춤
      howlsRef.current.forEach((howl) => {
        try {
          howl.pause();
          seekHowlSeconds(howl, t, "seeking");
        } catch {
          /* noop */
        }
      });
      const now = Date.now();
      if (now - audioSyncSeekingLogAtRef.current > 180) {
        audioSyncSeekingLogAtRef.current = now;
        logAudioSync("video-seeking (pause+seek, throttled)", {
          videoT: v?.currentTime,
          howlPosAfter: getFirstHowlReportedPos(howlsRef.current),
        });
      }
    };

    const onSeeked = () => {
      isSeekingRef.current = false;
      const v = videoRef?.current;
      if (!v) return;
      const raw = Number.isFinite(v.currentTime) ? Math.max(0, v.currentTime) : 0;
      const scrub = lastScrubVideoTimeRef.current;
      /* seeked 시점에 currentTime이 아직 0·이전 값인 브라우저가 있어 스크럽 마지막 값과 max */
      const tSeek = Math.max(raw, scrub);
      lastTrustedVideoTimeRef.current = tSeek;
      logAudioSync("video-seeked (before resync)", {
        videoT: raw,
        lastScrub: scrub,
        tSeek,
        paused: v.paused,
        lastTrusted: lastTrustedVideoTimeRef.current,
        howlPosSample: getFirstHowlReportedPos(howlsRef.current),
      });
      resyncHowlsAfterVideoSeek(tSeek);
      logAudioSync("video-seeked (after resync)", {
        videoT: videoRef?.current?.currentTime,
        howlPosSample: getFirstHowlReportedPos(howlsRef.current),
      });
    };

    const onTimeUpdate = () => {
      const tVideo = video.currentTime;
      if (Number.isFinite(tVideo)) {
        lastTrustedVideoTimeRef.current = Math.max(0, tVideo);
      }
      setCurrentTime(tVideo);

      if (Date.now() < skipTimeDriftSyncUntilRef.current) return;
      if (!startedRef.current || video.paused) return;

      const now = Date.now();
      if (now - timeUpdateDriftAtRef.current < TIMEUPDATE_DRIFT_THROTTLE_MS) {
        return;
      }

      if (now - lastTimeupdateHardSyncAtRef.current < TIMEUPDATE_HARD_SYNC_MIN_MS) {
        return;
      }

      const vt = video.currentTime;
      // howl.seek() 읽기 버그 우회: stem clock으로 drift 감지
      const scTu = stemClockRef.current;
      const stemPosTu = scTu.running
        ? scTu.startPos + (Date.now() - scTu.startMs) / 1000
        : scTu.startPos;
      if (Math.abs(stemPosTu - vt) <= TIMEUPDATE_DRIFT_SYNC_SEC) return;

      logAudioSync("timeupdate drift → hardSync+lead", {
        vt,
        stemEstimate: stemPosTu,
        targetWithLead: getSyncTargetTime(video, WEB_AUDIO_SYNC_LEAD_SEC),
        leadSec: WEB_AUDIO_SYNC_LEAD_SEC,
        howlPosSample: getFirstHowlReportedPos(howlsRef.current),
        threshold: TIMEUPDATE_DRIFT_SYNC_SEC,
        msSinceLastHardSync: now - lastTimeupdateHardSyncAtRef.current,
      });
      timeUpdateDriftAtRef.current = now;
      lastTimeupdateHardSyncAtRef.current = now;
      const syncTarget = getSyncTargetTime(video, WEB_AUDIO_SYNC_LEAD_SEC);
      stemClockRef.current = { startMs: Date.now(), startPos: syncTarget, running: true };
      hardSyncSlavesToMaster({ leadSec: WEB_AUDIO_SYNC_LEAD_SEC });
    };

    setIsPlaying(!video.paused);
    setCurrentTime(video.currentTime);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("timeupdate", onTimeUpdate);

    if (!video.paused) {
      onPlay();
    }

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("timeupdate", onTimeUpdate);
      clearSyncInterval();
    };
  }, [
    started,
    videoRef,
    clearSyncInterval,
    hardSyncSlavesToMaster,
    resyncHowlsAfterVideoSeek,
    runPeriodicDriftCorrection,
  ]);

  useEffect(() => {
    return () => {
      preloadGenRef.current++;
      disposeHowls();
    };
  }, [disposeHowls]);

  return {
    started,
    start,
    resetSession,
    setTrackMuted,
    mutedTracks,
    trackVolumes,
    setTrackVolume,
    resetMix,
    applyMixSnapshot,
    isPlaying,
    currentTime,
    mediaReady,
    loadProgress,
    loadError,
    loadStatus,
  };
}

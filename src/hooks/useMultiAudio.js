import { Howl, Howler } from "howler";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SYNC_INTERVAL_MS = 1000;
const SYNC_DRIFT_SEC = 0.25;
const SYNC_SEEK_THROTTLE_MS = 1500;
const DEFAULT_TRACK_VOLUME = 0.8;

Howler.autoUnlock = false;

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  // iPadOS는 platform이 MacIntel로 나오는 경우가 있어 터치 포인트로 보정
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (platform === "MacIntel" && maxTouchPoints > 1)
  );
}

function waitHowlLoad(howl, timeoutMs, onTimeout) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      window.clearTimeout(tid);
      ok ? resolve() : reject(new Error("loaderror"));
    };
    const tid = window.setTimeout(() => {
      try {
        onTimeout?.();
      } catch {
        /* noop */
      }
      finish(false);
    }, timeoutMs);
    try {
      // 이미 로드된 경우
      if (typeof howl.state === "function" && howl.state() === "loaded") {
        finish(true);
        return;
      }
      howl.once("load", () => finish(true));
      howl.once("loaderror", () => finish(false));
      if (typeof howl.load === "function") howl.load();
    } catch {
      finish(false);
    }
  });
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

  const iosRef = useRef(false);
  if (!iosRef.current) iosRef.current = isIOSDevice();
  const shouldUpgradeToWebAudioOnStart = iosRef.current;

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
  const videoReadyRef = useRef(false);
  const audioReadyIdsRef = useRef(new Set());
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const lastSeekAtRef = useRef(new Map());
  const webAudioUpgradedRef = useRef(false);

  const clearSyncInterval = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = 0;
    }
  }, []);

  const disposeHowls = useCallback(() => {
    clearSyncInterval();
    howlsRef.current.forEach((howl) => {
      try {
        howl.stop();
        howl.unload();
      } catch {
        /* noop */
      }
    });
    howlsRef.current = new Map();

    // 분석/네온 미터 상태도 같이 초기화
  }, [clearSyncInterval]);

  const hardSyncSlavesToMaster = useCallback(() => {
    const video = videoRef?.current;
    if (!video) return;
    const t = video.currentTime;
    howlsRef.current.forEach((howl) => {
      howl.seek(t);
    });
  }, [videoRef]);

  const runPeriodicDriftCorrection = useCallback(() => {
    const video = videoRef?.current;
    if (!video || video.paused) return;
    const t = video.currentTime;
    howlsRef.current.forEach((howl) => {
      const pos = howl.seek();
      const drift = Math.abs(pos - t);
      if (drift < SYNC_DRIFT_SEC) return;

      // 모바일(html5 스트리밍 포함)에서 seek은 끊김을 유발할 수 있어 과도한 재시킹 방지
      const now = Date.now();
      const last = lastSeekAtRef.current.get(howl) ?? 0;
      if (now - last < SYNC_SEEK_THROTTLE_MS) return;
      lastSeekAtRef.current.set(howl, now);

      howl.seek(t);
    });
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
    if (videoOk && audioOk) {
      setLoadProgress(100);
      setLoadStatus("준비 완료");
      setMediaReady(true);
    }
  }, []);

  useEffect(() => {
    const gen = ++preloadGenRef.current;
    videoReadyRef.current = false;
    audioReadyIdsRef.current = new Set();
    setMediaReady(false);
    setLoadProgress(0);
    setLoadError(null);
    setLoadStatus("미디어 준비 중…");
    startedRef.current = false;
    setStarted(false);
    clearSyncInterval();
    disposeHowls();
    mutedRef.current.clear();
    volumesRef.current.clear();
    setMutedTracks({});
    setTrackVolumes({});

    const list = tracksRef.current;

    const map = new Map();
    list.forEach((track) => {
      setLoadStatus(`오디오 로딩 중… (${track.id})`);
      const howl = new Howl({
        src: track.urls,
        preload: true,
        // 모바일에서 m4a를 WebAudio로 디코딩(preload)하다 멈추는 케이스가 있어 스트리밍 모드로 전환
        html5: true,
      });
      // 기본 볼륨(0.8) 적용. mute는 별도로 처리.
      try {
        howl.volume(DEFAULT_TRACK_VOLUME);
      } catch {
        /* noop */
      }
      volumesRef.current.set(track.id, DEFAULT_TRACK_VOLUME);
      map.set(track.id, howl);

      const loadTimeoutId = window.setTimeout(() => {
        if (gen !== preloadGenRef.current) return;
        setLoadError(`오디오 트랙을 불러오지 못했습니다. (${track.id})`);
      }, 12000);

      howl.once("load", () => {
        if (gen !== preloadGenRef.current) return;
        window.clearTimeout(loadTimeoutId);
        audioReadyIdsRef.current.add(track.id);
        recalcLoadProgress();
        tryMarkMediaReady(gen);
      });
      howl.once("loaderror", () => {
        if (gen !== preloadGenRef.current) return;
        window.clearTimeout(loadTimeoutId);
        setLoadError(`오디오 트랙을 불러오지 못했습니다. (${track.id})`);
      });
    });
    howlsRef.current = map;

    // 초기 볼륨 상태(0.8) 세팅
    const initialVolumes = {};
    list.forEach((t) => {
      initialVolumes[t.id] = DEFAULT_TRACK_VOLUME;
    });
    setTrackVolumes(initialVolumes);

    const bindVideo = (video) => {
      const tryMarkVideoReady = () => {
        // 모바일에선 canplay가 늦거나 안 오는 경우가 있어 완화 조건을 둠
        if (videoReadyRef.current) return;
        try {
          if (video.readyState >= 2) {
            videoReadyRef.current = true;
            setLoadStatus("비디오 준비 완료");
            return;
          }
          if (video.duration > 0 && video.buffered?.length) {
            const end = video.buffered.end(video.buffered.length - 1);
            // 아주 조금이라도 버퍼가 차면(> 0.25초) 준비로 간주
            if (end >= 0.25) {
              videoReadyRef.current = true;
              setLoadStatus("비디오 준비 완료");
            }
          }
        } catch {
          /* noop */
        }
      };

      const onVideoProgress = () => {
        if (gen !== preloadGenRef.current) return;
        setLoadStatus("비디오 로딩 중…");
        tryMarkVideoReady();
        recalcLoadProgress();
        // progress 이벤트에서 ready 판정이 나는 경우에도 mediaReady 재평가가 필요
        tryMarkMediaReady(gen);
      };

      // 모바일/저속 네트워크에서 canplaythrough는 오래 걸리거나 안 올 수 있어 canplay로 완화
      const onVideoCanPlay = () => {
        if (gen !== preloadGenRef.current) return;
        videoReadyRef.current = true;
        setLoadStatus("비디오 준비 완료");
        recalcLoadProgress();
        tryMarkMediaReady(gen);
      };

      const onVideoLoadedMetadata = () => {
        if (gen !== preloadGenRef.current) return;
        setLoadStatus("비디오 메타데이터 로딩…");
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
        setLoadError("비디오를 불러오지 못했습니다.");
      };

      video.addEventListener("progress", onVideoProgress);
      video.addEventListener("loadedmetadata", onVideoLoadedMetadata);
      video.addEventListener("loadeddata", onVideoLoadedData);
      video.addEventListener("canplay", onVideoCanPlay);
      video.addEventListener("error", onVideoError);

      if (video.readyState >= 2) {
        videoReadyRef.current = true;
      }
      tryMarkVideoReady();

      recalcLoadProgress();
      tryMarkMediaReady(gen);

      return () => {
        video.removeEventListener("progress", onVideoProgress);
        video.removeEventListener("loadedmetadata", onVideoLoadedMetadata);
        video.removeEventListener("loadeddata", onVideoLoadedData);
        video.removeEventListener("canplay", onVideoCanPlay);
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
        if (Date.now() - pollStart > 8000 && pollId != null) {
          window.clearInterval(pollId);
          pollId = null;
          if (gen === preloadGenRef.current) {
            setLoadError("비디오를 준비하는 데 시간이 오래 걸립니다. 새로고침 후 다시 시도해 주세요.");
          }
        }
      }, 50);
    }

    return () => {
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
    setLoadStatus("오디오 세션 준비 중…");

    const run = async () => {
      if (Howler.ctx) {
        try {
          await Howler.ctx.resume();
        } catch {
          /* noop */
        }
      }

      // iOS에서 html5 오디오는 볼륨 제어가 제한되는 경우가 있어,
      // start(사용자 제스처) 시점에 WebAudio 인스턴스로 업그레이드.
      if (shouldUpgradeToWebAudioOnStart && !webAudioUpgradedRef.current) {
        webAudioUpgradedRef.current = true;
        setLoadStatus("오디오 엔진 최적화 중…");

        const t = video.currentTime;
        const listNow = tracksRef.current;
        const nextMap = new Map();

        // 기존 html5 howl 정리
        howlsRef.current.forEach((h) => {
          try {
            h.stop();
            h.unload();
          } catch {
            /* noop */
          }
        });

        // WebAudio howl 재생성 + 로드 대기
        for (const tr of listNow) {
          const h = new Howl({
            src: tr.urls,
            preload: true,
            html5: false,
          });
          nextMap.set(tr.id, h);
        }
        howlsRef.current = nextMap;

        await Promise.all(
          listNow.map((tr) =>
            waitHowlLoad(nextMap.get(tr.id), 12000, () => {
              setLoadError(`오디오 트랙을 불러오지 못했습니다. (${tr.id})`);
            })
          )
        );

        // 업그레이드 후 현재 시간으로 맞춤
        nextMap.forEach((h) => {
          try {
            h.seek(t);
          } catch {
            /* noop */
          }
        });
      }

      const t = video.currentTime;
      const initialMuted = {};
      howlsRef.current.forEach((howl, id) => {
        try {
          howl.seek(t);
        } catch {
          /* noop */
        }
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

  const resetSession = useCallback(() => {
    preloadGenRef.current++;
    startingRef.current = false;
    startedRef.current = false;
    clearSyncInterval();
    disposeHowls();
    mutedRef.current.clear();
    setStarted(false);
    setMutedTracks({});
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
      const t = video.currentTime;
      // 모바일에서 트랙 수가 많을 때 한 프레임에 seek+play를 동시에 걸면 끊김이 커질 수 있어
      // 순차적으로 분산(stagger)해서 시작한다.
      const howls = Array.from(howlsRef.current.values());
      const stepMs = howls.length >= 7 ? 60 : 25;
      howls.forEach((howl, idx) => {
        window.setTimeout(() => {
          try {
            howl.seek(t);
            howl.play();
          } catch {
            /* noop */
          }
        }, idx * stepMs);
      });
      clearSyncInterval();
      syncIntervalRef.current = window.setInterval(
        runPeriodicDriftCorrection,
        SYNC_INTERVAL_MS
      );
    };

    const onPause = () => {
      setIsPlaying(false);
      clearSyncInterval();
      howlsRef.current.forEach((howl) => howl.pause());
    };

    const onSeeked = () => {
      hardSyncSlavesToMaster();
    };

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    setIsPlaying(!video.paused);
    setCurrentTime(video.currentTime);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("timeupdate", onTimeUpdate);

    if (!video.paused) {
      onPlay();
    }

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("timeupdate", onTimeUpdate);
      clearSyncInterval();
    };
  }, [
    started,
    videoRef,
    clearSyncInterval,
    hardSyncSlavesToMaster,
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
    isPlaying,
    currentTime,
    mediaReady,
    loadProgress,
    loadError,
    loadStatus,
  };
}

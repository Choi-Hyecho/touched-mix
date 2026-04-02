import { Howl, Howler } from "howler";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SYNC_INTERVAL_MS = 500;
const SYNC_DRIFT_SEC = 0.1;
const DEFAULT_TRACK_VOLUME = 0.8;

Howler.autoUnlock = false;

/**
 * 곡(songId)이 바뀌면 해당 곡의 비디오·오디오만 프리로드합니다.
 * Master: video — Slave: Howl. `start()`는 프리로드 완료 후 호출합니다.
 *
 * @param {object} options
 * @param {string} options.songId
 * @param {Array<{ id: string, url: string }>} options.tracks
 * @param {React.RefObject<HTMLVideoElement | null>} options.videoRef
 */
export function useMultiAudio({ songId, tracks = [], videoRef }) {
  const tracksKey = useMemo(
    () => tracks.map((t) => `${t.id}:${t.url}`).join("|"),
    [tracks]
  );

  const [started, setStarted] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState(null);
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
      if (Math.abs(pos - t) >= SYNC_DRIFT_SEC) {
        howl.seek(t);
      }
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
      const howl = new Howl({
        src: [track.url],
        preload: true,
        html5: false,
      });
      // 기본 볼륨(0.8) 적용. mute는 별도로 처리.
      try {
        howl.volume(DEFAULT_TRACK_VOLUME);
      } catch {
        /* noop */
      }
      volumesRef.current.set(track.id, DEFAULT_TRACK_VOLUME);
      map.set(track.id, howl);

      howl.once("load", () => {
        if (gen !== preloadGenRef.current) return;
        audioReadyIdsRef.current.add(track.id);
        recalcLoadProgress();
        tryMarkMediaReady(gen);
      });
      howl.once("loaderror", () => {
        if (gen !== preloadGenRef.current) return;
        setLoadError("오디오 트랙을 불러오지 못했습니다.");
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
      const onVideoProgress = () => {
        if (gen !== preloadGenRef.current) return;
        recalcLoadProgress();
      };

      const onVideoCanPlayThrough = () => {
        if (gen !== preloadGenRef.current) return;
        videoReadyRef.current = true;
        recalcLoadProgress();
        tryMarkMediaReady(gen);
      };

      const onVideoError = () => {
        if (gen !== preloadGenRef.current) return;
        setLoadError("비디오를 불러오지 못했습니다.");
      };

      video.addEventListener("progress", onVideoProgress);
      video.addEventListener("canplaythrough", onVideoCanPlayThrough);
      video.addEventListener("error", onVideoError);

      if (video.readyState >= 4) {
        videoReadyRef.current = true;
      }

      recalcLoadProgress();
      tryMarkMediaReady(gen);

      return () => {
        video.removeEventListener("progress", onVideoProgress);
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
    try {
      if (Howler.ctx) {
        void Howler.ctx.resume();
      }

      const t = video.currentTime;
      const initialMuted = {};
      howlsRef.current.forEach((howl, id) => {
        howl.seek(t);
        const m = mutedRef.current.get(id) === true;
        howl.mute(m);
        const v = volumesRef.current.get(id);
        if (typeof v === "number") howl.volume(v);
        initialMuted[id] = m;
      });
      setMutedTracks(initialMuted);

      startedRef.current = true;
      setStarted(true);
      return Promise.resolve();
    } finally {
      startingRef.current = false;
    }
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
      howlsRef.current.forEach((howl) => {
        howl.seek(t);
        howl.play();
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
  };
}

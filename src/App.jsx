import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import songsData from "./data/songs.json";
import {
  encodeMixState,
  getInitialMixRouteState,
} from "./utils/mixShare.js";
import {
  CONTACT_ACCOUNT_EN,
  CONTACT_ACCOUNT_KO,
  CONTACT_INSTAGRAM_URL,
  CONTACT_X_URL,
} from "./constants/onboarding.js";
import { FanMadeLegalNotice } from "./components/FanMadeLegalNotice.jsx";
import { useMultiAudio } from "./hooks/useMultiAudio.js";
import { Mixer } from "./components/Mixer.jsx";
import {
  PlaybackToggleButton,
  SessionStartButton,
} from "./components/SessionPlaybackControls.jsx";
import { OnboardingModal } from "./components/OnboardingModal.jsx";
import { VideoSkeletonScreen } from "./components/VideoSkeletonScreen.jsx";
import { Player } from "./components/Player.jsx";

export default function App() {
  const songs = useMemo(() => songsData, []);
  const [initialMixRoute] = useState(() => getInitialMixRouteState(songsData));
  const [songIndex, setSongIndex] = useState(initialMixRoute.songIndex);
  const [pendingShareMix, setPendingShareMix] = useState(initialMixRoute.preset);
  const [shareAdjustTrackIds, setShareAdjustTrackIds] = useState(
    () => initialMixRoute.preset?.adjustTrackIds ?? []
  );
  const [urlSyncEnabled, setUrlSyncEnabled] = useState(
    initialMixRoute.preset === null
  );
  const videoRef = useRef(null);
  const videoSectionRef = useRef(null);
  const selectedSongTabRef = useRef(null);
  /** 공유 링크 첫 진입 시 영상·탭이 뷰포트 안에 보이도록 한 번만 스크롤 */
  const scrollShareLandingRef = useRef(initialMixRoute.preset !== null);

  const activeSong = songs[songIndex] ?? songs[0];

  const audioTracks = useMemo(
    () =>
      (activeSong?.tracks ?? []).map((t) => ({
        id: t.id,
        urls: Array.isArray(t.urls) ? t.urls : [t.url].filter(Boolean),
      })),
    [activeSong]
  );

  const {
    started,
    start,
    setTrackMuted,
    mutedTracks,
    trackVolumes,
    setTrackVolume,
    resetMix,
    applyMixSnapshot,
    isPlaying,
    mediaReady,
    loadProgress,
    loadError,
    loadStatus,
  } = useMultiAudio({
    songId: activeSong?.id ?? "",
    tracks: audioTracks,
    videoRef,
  });

  const handleToggleTrack = useCallback(
    (trackId) => {
      const next = !(mutedTracks[trackId] === true);
      setTrackMuted(trackId, next);
    },
    [mutedTracks, setTrackMuted]
  );

  const handleStart = useCallback(async () => {
    if (!mediaReady) return;
    try {
      await start();
      const v = videoRef.current;
      if (v) await v.play();
    } catch {
      /* 오디오 세션 실패 등 */
    }
  }, [start, mediaReady]);

  useEffect(() => {
    if (!mediaReady) return;
    if (!pendingShareMix) return;
    if (pendingShareMix.songId !== activeSong.id) {
      setPendingShareMix(null);
      setUrlSyncEnabled(true);
      return;
    }
    applyMixSnapshot(pendingShareMix.muted, pendingShareMix.volumes);
    setShareAdjustTrackIds(pendingShareMix.adjustTrackIds ?? []);
    setPendingShareMix(null);
    setUrlSyncEnabled(true);
  }, [mediaReady, activeSong.id, pendingShareMix, applyMixSnapshot]);

  useEffect(() => {
    if (!mediaReady || !urlSyncEnabled) return;
    const song = songs[songIndex];
    if (!song?.tracks) return;
    const tid = window.setTimeout(() => {
      const ids = song.tracks.map((tr) => tr.id);
      const encoded = encodeMixState(
        song.id,
        mutedTracks,
        trackVolumes,
        ids
      );
      const url = new URL(window.location.href);
      url.searchParams.set("mix", encoded);
      window.history.replaceState(null, "", url.toString());
    }, 450);
    return () => window.clearTimeout(tid);
  }, [
    mediaReady,
    urlSyncEnabled,
    songIndex,
    mutedTracks,
    trackVolumes,
    songs,
  ]);

  const mixerShareAdjustSyncKey = useMemo(
    () =>
      `${activeSong.id}:${[...shareAdjustTrackIds].sort().join(",")}`,
    [activeSong.id, shareAdjustTrackIds]
  );

  const thumb = activeSong?.thumbnailUrl ?? "";
  const showLoading = !mediaReady && !loadError;
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef(0);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = 0;
    }
  }, []);

  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    clearHideTimer();
    // 재생 중일 때만 자동으로 숨김
    if (started && isPlaying) {
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 2200);
    }
  }, [clearHideTimer, started, isPlaying]);

  useEffect(() => {
    // 세션 전엔 Start 버튼이 항상 보여야 함
    if (!started) {
      setControlsVisible(true);
      clearHideTimer();
      return;
    }
    // 재생 시작/재개 시 잠깐 보여줬다가 숨김 타이머 갱신
    bumpControls();
    return () => clearHideTimer();
  }, [started, isPlaying, bumpControls, clearHideTimer]);

  useEffect(() => {
    if (!mediaReady) return;
    if (!scrollShareLandingRef.current) return;
    scrollShareLandingRef.current = false;

    const run = () => {
      selectedSongTabRef.current?.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
      videoSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    };

    const t = window.setTimeout(run, 120);
    return () => window.clearTimeout(t);
  }, [mediaReady]);

  useEffect(() => {
    selectedSongTabRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [songIndex]);

  const isKakao = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    return /KAKAOTALK/i.test(ua);
  }, []);

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-ym-bg text-white">
      {isKakao && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-5 bg-black/95 p-6 text-center backdrop-blur-sm">
          <p className="text-2xl">🌐</p>
          <p className="text-base font-bold text-white">카카오톡 브라우저에서는<br />음악이 제대로 재생되지 않아요</p>
          <p className="text-sm text-white/60 leading-relaxed">
            우측 상단 <span className="font-bold text-white/90">⋯</span> 메뉴에서<br />
            <span className="font-bold text-white/90">"기본 브라우저로 열기"</span>를 눌러주세요
          </p>
          <p className="text-xs text-white/40">Safari 또는 Chrome을 권장해요</p>
        </div>
      )}
      <OnboardingModal />
      <VideoSkeletonScreen
        open={showLoading}
        error={!!loadError}
        progress={loadProgress}
        status={loadStatus}
      />

      <div
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute inset-0 scale-110 bg-cover bg-center blur-[40px]"
          style={{ backgroundImage: thumb ? `url(${thumb})` : undefined }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-ym-bg/88 to-ym-bg" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(230,45,45,0.08),transparent_58%)]" />
      </div>

      <motion.div
        className="relative z-[1] mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 lg:max-w-xl"
        initial={false}
        animate={{
          opacity: mediaReady || loadError ? 1 : 0,
          filter: mediaReady || loadError ? "blur(0px)" : "blur(10px)",
        }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{
          pointerEvents: mediaReady || loadError ? "auto" : "none",
        }}
      >
        <header className="mb-4 flex flex-col items-center gap-1 text-center">
          <p className="font-display text-lg font-semibold uppercase tracking-[0.35em] text-ym-muted">
            RE-TOUCHED : STEMS PLAYER
          </p>
        </header>

        <nav
          className="mb-5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="곡 선택"
        >
          {songs.map((song, i) => (
            <button
              key={song.id}
              ref={i === songIndex ? selectedSongTabRef : null}
              type="button"
              onClick={() => {
                if (i !== songIndex) setShareAdjustTrackIds([]);
                setSongIndex(i);
              }}
              className={`min-h-[44px] shrink-0 rounded-full border-2 px-4 py-2.5 text-sm font-medium transition sm:min-h-[48px] ${
                i === songIndex
                  ? "border-brand bg-gradient-to-br from-neutral-950/95 via-zinc-900/90 to-brand/12 text-white shadow-[0_0_20px_rgba(230,45,45,0.22)]"
                  : "border-white/[0.1] bg-ym-surface/80 text-ym-muted backdrop-blur-md hover:bg-ym-elevated hover:text-white"
              }`}
            >
              {song.title}
            </button>
          ))}
        </nav>

        <section className="mb-5 w-full shrink-0" aria-label="영상">
          <Player
            key={activeSong.id}
            ref={videoRef}
            videoUrl={activeSong.videoUrl}
            posterUrl={activeSong.thumbnailUrl}
            title={activeSong.name ?? activeSong.title}
            sessionStarted={started}
            className="w-full"
            onInteract={bumpControls}
            overlay={
              (mediaReady || loadError) && controlsVisible ? (
                !started ? (
                  <SessionStartButton
                    onClick={handleStart}
                    disabled={!mediaReady}
                  />
                ) : (
                  <PlaybackToggleButton
                    isPlaying={isPlaying}
                    onClick={() => {
                      const v = videoRef.current;
                      if (!v) return;
                      if (isPlaying) v.pause();
                      else void v.play();
                    }}
                  />
                )
              ) : null
            }
          />
        </section>

        <div className="mt-auto flex w-full flex-col gap-5">
          <Mixer
            tracks={activeSong.tracks}
            mutedTracks={mutedTracks}
            onToggleTrack={handleToggleTrack}
            trackVolumes={trackVolumes}
            setTrackVolume={setTrackVolume}
            onResetMix={resetMix}
            shareAdjustTrackIds={shareAdjustTrackIds}
            shareAdjustSyncKey={mixerShareAdjustSyncKey}
            shareDisabled={!mediaReady || !!loadError}
            songTitle={activeSong?.name ?? ""}
          />
        </div>

        <footer className="mt-8 space-y-3 px-1 text-center text-[0.62rem] font-sans leading-relaxed text-ym-muted/75 sm:text-[0.65rem]">
          <FanMadeLegalNotice className="mx-auto max-w-md [word-break:keep-all]" />
          <p className="mx-auto max-w-md text-ym-muted/80 [word-break:keep-all]">
            문의 · 버그 제보: {CONTACT_ACCOUNT_KO}
            <span className="font-display not-italic">{CONTACT_ACCOUNT_EN}</span>{" "}
            <a
              href={CONTACT_X_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-display font-medium text-brand-light/90 underline decoration-white/20 underline-offset-2 transition hover:text-brand-light hover:decoration-brand-light/50"
            >
              X
            </a>
            {" · "}
            <a
              href={CONTACT_INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-display font-medium text-brand-light/90 underline decoration-white/20 underline-offset-2 transition hover:text-brand-light hover:decoration-brand-light/50"
            >
              Instagram
            </a>
          </p>
          <p className="font-display tabular-nums tracking-wide text-ym-muted/55">
            RE-TOUCHED : STEMS PLAYER · v0.0.1
          </p>
        </footer>
      </motion.div>
    </div>
  );
}

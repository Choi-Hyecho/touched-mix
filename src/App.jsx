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
  ARTIST_BSTAGE_URL,
  ARTIST_YOUTUBE_URL,
  ARTIST_INSTAGRAM_URL,
  ARTIST_X_URL,
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
        errorMessage={loadError}
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
          <p className="font-display text-sm font-semibold uppercase tracking-[0.35em] text-ym-muted">
            RE-TOUCHED
          </p>
          <h1 className="text-sm font-bold tracking-tight sm:text-xl">
            STEMS PLAYER
          </h1>
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

          <div className="mt-1 flex flex-col items-center gap-1">
            <p className="font-sans text-[0.6rem] text-ym-muted/50 [word-break:keep-all]">
              아티스트에 대해 더 알고 싶다면
            </p>
            <div className="flex flex-col items-center gap-0.5">
              <a
                href={(() => { const d = new Date(); return `${ARTIST_BSTAGE_URL}/schedule/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`; })()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-display text-[0.62rem] text-ym-muted/60 transition hover:text-brand-light/90"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5 shrink-0">
                  <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
                </svg>
                Bstage
              </a>
              <a
                href={ARTIST_YOUTUBE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-display text-[0.62rem] text-ym-muted/60 transition hover:text-brand-light/90"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5 shrink-0">
                  <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                </svg>
                / @touched_official
              </a>
              <a
                href={ARTIST_INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-display text-[0.62rem] text-ym-muted/60 transition hover:text-brand-light/90"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5 shrink-0">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
                / touched_official
              </a>
              <a
                href={ARTIST_X_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-display text-[0.62rem] text-ym-muted/60 transition hover:text-brand-light/90"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5 shrink-0">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                / band_touched
              </a>
            </div>
          </div>
        </footer>
      </motion.div>
    </div>
  );
}

import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import songsData from "./data/songs.json";
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
  const [songIndex, setSongIndex] = useState(0);
  const videoRef = useRef(null);

  const activeSong = songs[songIndex] ?? songs[0];

  const audioTracks = useMemo(
    () =>
      (activeSong?.tracks ?? []).map((t) => ({ id: t.id, url: t.url })),
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
    isPlaying,
    mediaReady,
    loadProgress,
    loadError,
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

  const thumb = activeSong?.thumbnailUrl ?? "";
  const showLoading = !mediaReady && !loadError;

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-ym-bg text-white">
      <OnboardingModal />
      <VideoSkeletonScreen open={showLoading} progress={loadProgress} />

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
        {loadError ? (
          <div
            className="mb-4 rounded-xl border border-red-500/40 bg-red-950/50 px-4 py-3 text-center text-sm text-red-200 backdrop-blur-md"
            role="alert"
          >
            {loadError}
          </div>
        ) : null}

        <header className="mb-4 flex flex-col items-center gap-1 text-center">
          <p className="font-display text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-ym-muted">
            TOUCHED
          </p>
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">
            챌린지 믹서
          </h1>
        </header>

        <nav
          className="mb-5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="곡 선택"
        >
          {songs.map((song, i) => (
            <button
              key={song.id}
              type="button"
              onClick={() => setSongIndex(i)}
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
            title={activeSong.title}
            sessionStarted={started}
            className="w-full"
            overlay={
              mediaReady || loadError ? (
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
            TOUCHED Mixer · v0.0.1
          </p>
        </footer>
      </motion.div>
    </div>
  );
}

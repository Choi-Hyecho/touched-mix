import { motion } from "framer-motion";

/** 세션 시작 — 검정·브랜드 그라데이션 + 두꺼운 브랜드 링 */
export function SessionStartButton({ onClick, disabled }) {
  return (
    <motion.button
      type="button"
      aria-label="오디오 세션 시작"
      title="오디오 세션 시작"
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.06 }}
      whileTap={{ scale: disabled ? 1 : 0.94 }}
      className="group relative mx-auto flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full border-[3px] border-brand bg-gradient-to-br from-neutral-950 via-zinc-900 to-brand/25 font-display text-white shadow-[0_12px_40px_rgba(0,0,0,0.55)] transition-opacity disabled:cursor-not-allowed disabled:opacity-35 sm:h-[4.75rem] sm:w-[4.75rem]"
      onClick={onClick}
    >
      <span className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent to-white/8 opacity-0 transition-opacity group-hover:opacity-100 group-disabled:opacity-0" />
      <svg
        viewBox="0 0 24 24"
        className="relative z-[1] ml-1 h-10 w-10 sm:h-11 sm:w-11"
        fill="currentColor"
        aria-hidden
      >
        <path d="M8 5.14v14l11-7-11-6.86z" />
      </svg>
    </motion.button>
  );
}

/** 재생 / 일시정지 — 다크 그라데이션 + 브랜드 테두리 */
export function PlaybackToggleButton({ isPlaying, onClick }) {
  return (
    <motion.button
      type="button"
      aria-label={isPlaying ? "일시정지" : "재생"}
      title={isPlaying ? "일시정지" : "재생"}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      className="mx-auto flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full border-[3px] border-brand/55 bg-gradient-to-br from-neutral-950/95 via-zinc-900/90 to-brand/15 text-white shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-sm sm:h-[4.75rem] sm:w-[4.75rem]"
      onClick={onClick}
    >
      {isPlaying ? (
        <svg
          viewBox="0 0 24 24"
          className="h-9 w-9 sm:h-10 sm:w-10"
          fill="currentColor"
          aria-hidden
        >
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="ml-1 h-9 w-9 sm:h-10 sm:w-10"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8 5.14v14l11-7-11-6.86z" />
        </svg>
      )}
    </motion.button>
  );
}

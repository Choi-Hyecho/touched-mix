import { AnimatePresence, motion } from "framer-motion";

/**
 * 미니멀 다크 모드 스켈레톤 — 좌→우 쉬머, 하단 재생 컨트롤 실루엣(블러)
 */
export function VideoSkeletonScreen({ open, progress = 0, status = "" }) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="video-skeleton"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="미디어 로딩 중"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[100] flex flex-col bg-[#0a0a0a]"
        >
          <div className="flex min-h-[100dvh] flex-col items-center justify-center px-5 pb-12 pt-[max(2rem,env(safe-area-inset-top))]">
            <div className="relative w-full max-w-[min(100%,420px)]">
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111] shadow-[0_24px_80px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.04]">
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.045] via-transparent to-white/[0.02]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.5)_100%)]" />

                <div className="absolute inset-0 overflow-hidden rounded-2xl">
                  <div
                    className="absolute -top-[25%] bottom-[-25%] left-0 w-[70%] bg-gradient-to-r from-transparent via-white/[0.2] to-transparent opacity-[0.85] blur-[6px] animate-skeleton-shimmer"
                    style={{
                      maskImage:
                        "linear-gradient(90deg, transparent 0%, black 28%, black 72%, transparent 100%)",
                      WebkitMaskImage:
                        "linear-gradient(90deg, transparent 0%, black 28%, black 72%, transparent 100%)",
                    }}
                  />
                </div>
              </div>
            </div>

            <div
              className="mt-12 flex w-full max-w-[min(100%,320px)] flex-col items-center gap-6 opacity-[0.38] [filter:blur(6px)]"
              aria-hidden
            >
              <div className="h-[3.25rem] w-[3.25rem] rounded-full bg-gradient-to-b from-white/22 to-white/[0.07] shadow-inner ring-1 ring-white/10" />
              <div className="h-1 w-full rounded-full bg-gradient-to-r from-white/[0.08] via-white/18 to-white/[0.08]" />
              <div className="flex w-full items-center gap-3 px-1">
                <div className="h-2 w-7 rounded-sm bg-white/14" />
                <div className="h-2 flex-1 rounded-full bg-white/11" />
                <div className="h-2 w-9 rounded-sm bg-white/11" />
              </div>
            </div>

            {status ? (
              <p className="mt-6 max-w-[22rem] text-center text-xs font-medium text-white/55">
                {status}
              </p>
            ) : null}

            <p className="mt-3 font-mono text-[0.7rem] tabular-nums tracking-[0.22em] text-white/22">
              {Math.min(100, Math.max(0, Math.round(progress)))}%
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

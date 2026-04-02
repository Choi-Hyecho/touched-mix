import { AnimatePresence, motion } from "framer-motion";

const bars = [0, 1, 2, 3, 4, 5];

export function MixerLoadingOverlay({
  open,
  thumbnailUrl,
  progress,
  message = "믹서 세팅 중...",
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="mixer-loading"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6"
        >
          <div
            className="absolute inset-0 scale-110 bg-cover bg-center blur-[48px]"
            style={{
              backgroundImage: thumbnailUrl ? `url(${thumbnailUrl})` : undefined,
            }}
          />
          <div className="absolute inset-0 bg-black/72 backdrop-blur-sm" />

          <div className="relative flex max-w-sm flex-col items-center text-center">
            <div className="mb-8 flex h-14 items-end justify-center gap-1.5 sm:h-16 sm:gap-2">
              {bars.map((i) => (
                <motion.div
                  key={i}
                  className="w-1 rounded-full bg-gradient-to-t from-brand to-brand-light sm:w-1.5"
                  initial={{ height: 10 }}
                  animate={{
                    height: [10, 44, 14, 36, 10],
                    opacity: [0.45, 1, 0.55, 1, 0.45],
                  }}
                  transition={{
                    duration: 1.15,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.1,
                  }}
                />
              ))}
            </div>

            <motion.p
              className="text-lg font-bold tracking-tight text-white sm:text-xl"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
            >
              {message}
            </motion.p>

            <motion.p
              className="mt-4 font-mono text-3xl font-semibold tabular-nums text-brand-light sm:text-4xl"
              key={progress}
              initial={{ opacity: 0.6, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              {progress}%
            </motion.p>

            <div className="mt-6 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-brand-muted to-brand-light"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 24 }}
              />
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

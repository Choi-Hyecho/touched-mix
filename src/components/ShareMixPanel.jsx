import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Link2 } from "lucide-react";

function IconX({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function IconInstagram({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function IconKakao({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#3C1E1E"
        d="M12 3c-4.97 0-9 3.11-9 6.96 0 2.4 1.64 4.52 4.1 5.74l-.95 3.48a.48.48 0 00.74.52l4.1-2.24h.96c4.97 0 9-3.11 9-6.96S16.97 3 12 3z"
      />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.disabled
 * @param {string} props.songTitle
 */
export function ShareMixPanel({ disabled, songTitle = "" }) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");

  const shareUrl =
    typeof window !== "undefined" ? window.location.href : "";
  const line = `TOUCHED 믹서${songTitle ? ` · ${songTitle}` : ""}`;

  const showToast = useCallback((msg, visibleMs = 2800) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), visibleMs);
  }, []);

  const shareTwitter = useCallback(() => {
    const u = `https://twitter.com/intent/tweet?text=${encodeURIComponent(line)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(u, "_blank", "noopener,noreferrer");
  }, [line, shareUrl]);

  const shareInstagram = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: line,
          text: line,
          url: shareUrl,
        });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("인스타 앱에 붙여넣기 해 주세요.", 3200);
    } catch {
      window.prompt("링크를 복사해 주세요.", shareUrl);
    }
  }, [line, shareUrl, showToast]);

  const shareKakao = useCallback(async () => {
    const text = `${line}\n${shareUrl}`;
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (mobile) {
      window.location.href = `kakaotalk://send?text=${encodeURIComponent(text)}`;
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("카카오톡 채팅에 붙여넣기 해 주세요.", 3200);
    } catch {
      window.prompt("링크를 복사해 주세요.", shareUrl);
    }
  }, [line, shareUrl, showToast]);

  const copyUrlOnly = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("복사 완료", 2400);
    } catch {
      window.prompt("아래 주소를 복사해 주세요.", shareUrl);
    }
  }, [shareUrl, showToast]);

  return (
    <div className="flex w-full flex-col items-stretch gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="share-mix-options"
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.14] bg-white/[0.06] px-4 py-2.5 text-[0.72rem] font-semibold text-white/85 backdrop-blur-md transition hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[48px]"
      >
        현재 세팅 공유하기
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id="share-mix-options"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.1] bg-black/35 px-3 py-3 backdrop-blur-md">
              <span className="w-full text-center text-[0.65rem] font-medium text-white/45">
                공유할 곳을 선택하세요
              </span>
              <div className="relative w-full">
                <div className="flex w-full flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={shareTwitter}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.12] bg-white text-black transition hover:bg-white/90"
                    aria-label="X(트위터)로 공유"
                    title="X(트위터)"
                  >
                    <IconX className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={shareInstagram}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.12] bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white transition hover:opacity-95"
                    aria-label="인스타그램으로 공유"
                    title="Instagram"
                  >
                    <IconInstagram className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={shareKakao}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#f0d040]/30 bg-[#FEE500] transition hover:bg-[#ffe033]"
                    aria-label="카카오톡으로 공유"
                    title="카카오톡"
                  >
                    <IconKakao className="h-7 w-7" />
                  </button>
                  <button
                    type="button"
                    onClick={copyUrlOnly}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.14] bg-white/[0.08] text-white transition hover:bg-white/[0.14]"
                    aria-label="URL 복사"
                    title="URL 복사"
                  >
                    <Link2 className="h-5 w-5" strokeWidth={2.25} />
                  </button>
                </div>
                <AnimatePresence>
                  {toast ? (
                    <motion.div
                      key="share-toast"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center rounded-2xl bg-neutral-950/88 px-3 py-2 shadow-inner ring-1 ring-white/15 backdrop-blur-md"
                      role="status"
                    >
                      <p
                        className="max-w-[min(100%,18rem)] text-center text-[0.8125rem] font-semibold leading-snug tracking-tight text-white [text-wrap:balance] [text-shadow:0_1px_4px_rgba(0,0,0,0.95),0_0_1px_rgba(0,0,0,1)]"
                      >
                        {toast}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

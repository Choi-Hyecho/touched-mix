import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "./Button.jsx";
import {
  CONTACT_ACCOUNT_EN,
  CONTACT_ACCOUNT_KO,
  CONTACT_INSTAGRAM_URL,
  CONTACT_X_URL,
} from "../constants/onboarding.js";
import { FanMadeLegalNotice } from "./FanMadeLegalNotice.jsx";

export function OnboardingModal() {
  // 매 페이지 로드마다 표시 (localStorage 저장 없음)
  const [open, setOpen] = useState(true);

  const dismiss = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="onboarding-root"
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          aria-describedby="onboarding-body"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            aria-label="닫기"
            onClick={dismiss}
          />
          <motion.div
            className="relative z-[1] w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-[#181818] shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.05]"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <div className="border-b border-white/[0.06] px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
              <h2
                id="onboarding-title"
                className="text-lg font-bold tracking-tight text-white sm:text-xl"
              >
               사용 안내
              </h2>
            </div>
            <div
              id="onboarding-body"
              className="space-y-4 px-5 py-4 text-sm leading-relaxed text-white/80 sm:px-6"
            >
              <p>
                <strong className="font-display font-semibold text-brand-light">
                  재생 버튼
                </strong>
                을 눌러 세션을 시작하세요. <br />
                <span>
                  버튼을 눌러서 파트별 음소거를 켜고 끌 수 있어요.{" "} <br />
                </span>
                <span>
                  버튼을 3초 정도 꾹 누르면 파트별 음량을 조절할 수 있어요.{" "}
                </span>
              </p>
              <FanMadeLegalNotice className="text-[0.8125rem] leading-relaxed text-white/65" />
              <p className="rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-[0.8125rem] text-white/75">
                😋 새 곡이 추가됐어요 — <span className="font-semibold text-white/90">찹쌀떡 / 10cm</span> <span className="text-white/45">(2026.05.04)</span>
              </p>
              <p className="text-white/55">
                문의·제보: {CONTACT_ACCOUNT_KO}
                <span className="font-display not-italic">{CONTACT_ACCOUNT_EN}</span>{" "}
                <a
                  href={CONTACT_X_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display font-medium text-brand-light underline decoration-white/25 underline-offset-2 transition hover:text-brand-light hover:decoration-brand-light/60"
                >
                  X
                </a>
                {" · "}
                <a
                  href={CONTACT_INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display font-medium text-brand-light underline decoration-white/25 underline-offset-2 transition hover:text-brand-light hover:decoration-brand-light/60"
                >
                  Instagram
                </a>
              </p>
            </div>
            <div className="border-t border-white/[0.06] px-5 pb-5 pt-4 sm:px-6">
              <Button type="button" onClick={dismiss}>
                시작하기
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

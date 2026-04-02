import { FAN_MADE_NOTICE_PARTS } from "../constants/onboarding.js";

/** 영문 구간은 Montserrat (`font-display`) */
export function FanMadeLegalNotice({ className = "" }) {
  const p = FAN_MADE_NOTICE_PARTS;
  return (
    <p className={className}>
      {p.before}
      <span className="font-display not-italic">{p.emphasis}</span>
      {p.after}
    </p>
  );
}

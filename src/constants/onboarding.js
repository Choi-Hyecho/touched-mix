/**
 * 온보딩 안내 문구/동작을 바꿔 다시 보여주고 싶을 때 버전만 올리면
 * 이전에 닫았던 기록과 무관하게 한 번 더 뜹니다.
 */
export const ONBOARDING_STORAGE_VERSION = 3;

/** 값이 `'true'`이면 해당 버전 온보딩을 다시 보지 않음 */
export const ONBOARDING_STORAGE_KEY = `touched-mixer-onboarding-v${ONBOARDING_STORAGE_VERSION}-dismissed`;

/** 문의·버그 제보용 SNS */
export const CONTACT_X_URL = "https://x.com/RecOfTouching";
export const CONTACT_INSTAGRAM_URL =
  "https://www.instagram.com/rec_of_touched/";

/** 한글 닉 + 공백 — Montserrat는 `CONTACT_ACCOUNT_EN`만 */
export const CONTACT_ACCOUNT_KO = "@닿음의 기록 ";
/** 영문 핸들 (Montserrat) */
export const CONTACT_ACCOUNT_EN = "(rec_of_touched)";
/** 한 줄 표기 (접근성·복사용 등) */
export const CONTACT_ACCOUNT_DISPLAY = `${CONTACT_ACCOUNT_KO}${CONTACT_ACCOUNT_EN}`;

/** 개발 중 매번 온보딩을 보고 싶을 때만 `true` */
export const FORCE_ONBOARDING_EVERY_LOAD = false;

/** TOUCHED 공식 채널 · 홈 */
export const ARTIST_BSTAGE_URL = "https://touched.bstage.in";

/** TOUCHED 공식 SNS */
export const ARTIST_YOUTUBE_URL =
  "https://www.youtube.com/channel/UC1VarYVKLPA6DL8rLclYxBg";
export const ARTIST_INSTAGRAM_URL =
  "https://www.instagram.com/touched_official/";
export const ARTIST_X_URL = "https://twitter.com/band_touched";

/**
 * Fan-made · 저작권 안내 — `emphasis`만 Montserrat 적용
 * (온보딩·푸터는 FanMadeLegalNotice 컴포넌트 사용)
 */
export const FAN_MADE_NOTICE_PARTS = {
  before: "본 서비스는 '",
  emphasis: "FANMADE",
  after:
    "' 프로젝트입니다. 모든 음원 및 영상의 저작권은 원 저작권자에게 있습니다.",
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Pretendard",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        /** 영문 제목·강조 (Start, TOUCHED, Mixer 등) */
        display: ["Montserrat", "ui-sans-serif", "system-ui", "sans-serif"],
        /** 크레딧·개발자 톤 */
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        touched: {
          accent: "#ff3d8a",
          glow: "#ff6bcb",
          dim: "#7c3f65",
        },
        ym: {
          bg: "#0f0f0f",
          surface: "#181818",
          elevated: "#282828",
          muted: "#a7a7a7",
        },
        /**
         * 로고 솔리드 레드 샘플 (#E62D2D) — 보조 톤만 살짝 조정
         */
        brand: {
          DEFAULT: "#E62D2D",
          light: "#F05A5A",
          muted: "#C41E1E",
          deep: "#951818",
          surface: "rgba(230, 45, 45, 0.14)",
        },
      },
      boxShadow: {
        neon: "0 0 20px rgba(255, 61, 138, 0.55), 0 0 48px rgba(255, 107, 203, 0.28), inset 0 0 24px rgba(255, 255, 255, 0.06)",
        "neon-sm": "0 0 12px rgba(255, 61, 138, 0.45), 0 0 28px rgba(255, 107, 203, 0.2)",
        "neon-brand":
          "0 0 14px rgba(230, 45, 45, 0.4), 0 0 28px rgba(230, 45, 45, 0.16), 0 0 42px rgba(240, 90, 90, 0.1)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.45)",
        "brand-glow":
          "0 12px 40px rgba(230, 45, 45, 0.28), 0 0 22px rgba(230, 45, 45, 0.12)",
        "brand-glow-sm": "0 0 20px rgba(230, 45, 45, 0.22)",
      },
      keyframes: {
        "skeleton-shimmer": {
          "0%": { transform: "translateX(-120%) skewX(-14deg)" },
          "100%": { transform: "translateX(220%) skewX(-14deg)" },
        },
      },
      animation: {
        "skeleton-shimmer":
          "skeleton-shimmer 2.6s cubic-bezier(0.45, 0, 0.55, 1) infinite",
      },
    },
  },
  plugins: [],
};

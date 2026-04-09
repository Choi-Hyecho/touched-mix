import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react({ include: "**/*.{jsx,tsx,js,ts}" }),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        // 앱 껍데기(JS/CSS/HTML)는 precache
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],

        // 비디오·오디오는 용량이 커서 precache 제외 — 재생 시 자동 캐시(CacheFirst)
        globIgnores: ["**/videos/**", "**/audio/**"],

        runtimeCaching: [
          {
            // 오디오 m4a — CacheFirst: 한 번 받으면 캐시에서 바로 서빙
            urlPattern: /\/audio\/.*\.m4a$/,
            handler: "CacheFirst",
            options: {
              cacheName: "audio-cache-v2",
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30일
              },
              cacheableResponse: { statuses: [200] },
              rangeRequests: true, // 브라우저 range request(부분 로딩) 지원
            },
          },
          {
            // 비디오 webm — CacheFirst: 가장 효과 큰 부분
            urlPattern: /\/videos\/.*\.webm$/,
            handler: "CacheFirst",
            options: {
              cacheName: "video-cache-v1",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30일
              },
              cacheableResponse: { statuses: [200] },
              rangeRequests: true,
            },
          },
          {
            // 썸네일 이미지
            urlPattern: /\/images\/.*\.(jpg|jpeg|png|webp)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache-v1",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      manifest: {
        name: "TOUCHED 챌린지 믹서",
        short_name: "TOUCHED 믹서",
        description: "TOUCHED 챌린지 영상 믹서",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        icons: [
          {
            src: "/logo.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Tormenta — Seus personagens",
        short_name: "Tormenta",
        description:
          "Sua ficha, sua história. Gerenciador offline de personagens de Tormenta20.",
        lang: "pt-BR",
        theme_color: "#111311",
        background_color: "#111311",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: [
          "**/*.{js,mjs,css,html,svg,png,json,txt,woff2,pdf,wasm,bcmap,pfb,ttf,icc}",
        ],
        // The original local book is 65.7 MB; cache the full file so every page
        // and its illustrations remain available after the first complete load.
        maximumFileSizeToCacheInBytes: 75000000,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 2200 },
});

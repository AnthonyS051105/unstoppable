import type { MetadataRoute } from "next";

// Minimal PWA for Web Push only (ARCHITECTURE AD-10, revised v1.4.2). No offline caching.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Unstoppable — Sampai dengan Selamat",
    short_name: "Unstoppable",
    description: "Navigasi dan pendampingan lansia serta pemantauan perjalanan oleh keluarga.",
    id: "/",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#f5f5f4", // --bg
    theme_color: "#FFC629", // same as viewport.themeColor in layout.tsx
    lang: "id",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

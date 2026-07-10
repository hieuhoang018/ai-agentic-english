import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "English Academy - Wise Mentor AI",
    short_name: "English Academy",
    description: "English application for learning English with AI-powered mentor.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7fafc",
    theme_color: "#0f62fe",
    lang: "vi",
    dir: "ltr",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

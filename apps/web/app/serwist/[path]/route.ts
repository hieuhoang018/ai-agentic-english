import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// Cache-busts the offline-page precache entry on every deploy (falls back to a random UUID if
// git isn't available in the build environment, e.g. some CI/deploy containers).
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [{ url: "/offline", revision }],
    swSrc: "app/sw.ts",
    useNativeEsbuild: true,
  });

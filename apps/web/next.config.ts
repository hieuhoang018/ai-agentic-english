import path from "node:path";
import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

// Next.js 16 defaults `next build`/`next dev` to Turbopack, which `@serwist/next`'s
// webpack-plugin-based integration doesn't support (build fails outright — see
// docs/pwa-implementation-plan.md Stage 3). `@serwist/turbopack` is Serwist's Turbopack-
// compatible integration: instead of writing a static public/sw.js at build time, it serves
// the bundled service worker from a Route Handler (app/serwist/[path]/route.ts).
const nextConfig: NextConfig = {
  // This repo has a stray, pre-existing apps/web/package-lock.json alongside the real
  // (npm-workspaces) root lockfile — predates this PWA work, unrelated to Serwist. Left
  // ambiguous, Turbopack's root-detection heuristic sometimes guesses wrong, which breaks
  // resolution of its own internal next/font/google module ("Can't resolve
  // '@vercel/turbopack-next/internal/font/google/font'") at build time. Pin it explicitly so
  // the build doesn't depend on which lockfile Turbopack happens to pick.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default withSerwist(nextConfig);

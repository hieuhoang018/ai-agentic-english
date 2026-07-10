import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Session/identity-sensitive traffic must never be served stale or from a shared cache.
// Placed first so it wins over defaultCache's generic same-origin "/api/*" NetworkFirst rule —
// see docs/pwa-implementation-plan.md Stage 3. Both routes are POST-only today (no GET to
// accidentally cache either way), but this guards against a future GET being added under them.
const neverCacheSensitiveApis: RuntimeCaching = {
  matcher: ({ url }) =>
    url.pathname.startsWith("/api/orchestrate/") || url.pathname.startsWith("/api/speaking/"),
  handler: new NetworkOnly(),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [neverCacheSensitiveApis, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

import { BACKGROUND_SYNC_TAG, flushPendingReviews } from "../lib/offline/reviews";

// The Background Sync API's `sync` event isn't in TS's default lib.dom.d.ts
// (still not universally standardized) — declare just enough of the shape to
// type the listener below.
interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
}

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
  interface ServiceWorkerGlobalScopeEventMap {
    sync: SyncEvent;
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

// Fires once connectivity returns, even if no tab is open — reliably drains
// the offline-rating queue instead of depending on the user reopening the
// app. No token refresh here: the SW has no access to a live Clerk session
// token, so a stale/expired one simply fails the fetch (401) and lets
// Background Sync's built-in retry-with-backoff catch it on the next
// opportunity, until a real foreground visit (watchForOnlineFlush in
// app/components/OfflineSyncListener.tsx) flushes with a fresh token. See
// docs/pwa-offline-sync-and-push-plan.md Stage 3.
self.addEventListener("sync", (event) => {
  if (event.tag === BACKGROUND_SYNC_TAG) {
    event.waitUntil(flushPendingReviews());
  }
});

type PushPayload = { title: string; body: string; url?: string };

// Delivers a notification to the OS tray even when the app/tab is closed —
// distinct from the in-app Novu <Inbox> (NotificationInbox.tsx), which only
// renders while the tab is open. Payload shape matches
// services/notification-service/src/lib/webPush.ts's PushPayload.
self.addEventListener("push", (event) => {
  const payload: Partial<PushPayload> = event.data?.json() ?? {};
  const title = payload.title ?? "English Academy";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windowClients.find((client) => new URL(client.url).pathname === url);
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

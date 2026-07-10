# PWA Advanced Capabilities — Offline Sync, Background Sync, Push Notifications

## Status

**Implementation-ready as of 2026-07-10.** This doc was originally a scoping placeholder (see
git history for that version); it's now a real stage-by-stage plan, matching the shape of
`docs/pwa-implementation-plan.md`. Nothing below has been built yet — Stage 1 is the starting
point.

Audience: frontend dev picking up PWA work again. Relates to: `docs/pwa-implementation-plan.md`
(parent plan, Stages 1–6 done — manifest, icons, service worker, install prompt, Vercel deploy),
`CLAUDE.local.md` Phase 7 (AGT-07 offline sync backend, already done and unchanged by this plan),
the Novu inbox section (existing in-app notification wiring, distinct from push, see Stage 4).

## Why these three are bundled into one plan

- **Offline data sync (IndexedDB) and Background Sync are two halves of one feature.** IndexedDB
  is where the user's offline actions (a flashcard rating) get stored while there's no
  connection. Background Sync is the browser API that reliably flushes that queue once
  connectivity returns — *even if the tab is closed* — instead of only syncing on next foreground
  load. Building the queue without Background Sync leaves the flush trigger fragile
  (foreground-only `online` listener); building them together means the drain code is written
  once.
- **All three extend the same service worker file** (`apps/web/app/sw.ts`). A `push` listener and
  a `sync` listener are more handlers on the same file, not a new subsystem.
- **Push notifications share little code with the other two** but reuses the same
  "browser-support-matrix + permission-prompt UX" pattern `InstallPwaPrompt.tsx` already
  established (feature-detect, respect dismissal, don't nag).

## Current state (verified against code, 2026-07-10)

- Zero IndexedDB usage anywhere in `apps/web` — greenfield. No `idb` package installed.
- `app/sw.ts` has `neverCacheSensitiveApis` (NetworkOnly on `/api/orchestrate/*` and
  `/api/speaking/*`) plus Serwist's `defaultCache`, an offline-fallback route, `skipWaiting` +
  `clientsClaim`. No `sync` or `push` listeners yet.
- AGT-07 backend is fully built and unchanged by this plan:
  - `GET /offline/{clerk_user_id}/package` → `{ clerk_user_id, generated_at, flashcards_due,
    sm2_state, highlight_snapshot }` (`agents/agt07_review/offline.py::get_offline_package`).
  - `POST /offline/{clerk_user_id}/sync` → body `{ reviews: [{ review_id, item_id, quality,
    reviewed_at? }] }`, returns `{ applied, skipped, errors }`. Idempotent via
    `offline_review_log` (migration `016`, `review_id TEXT PRIMARY KEY`), ordered replay per
    `item_id` so cascading SM-2 state matches online-order semantics.
  - Both routes gated by `require_matching_user` (403 on JWT/path mismatch), already Kong-routed:
    `agt07-offline` → `/api/offline` → `agt07-review:8107/offline`.
  - **Missing**: no Next.js proxy route (`apps/web/app/api/offline/*`) — every other backend
    consumer in this app goes through a same-origin proxy (see `app/api/review/due/route.ts` and
    `.../rate/route.ts` for the pattern: `auth()` from Clerk, `getToken()`, `apiFetch` against
    `API_BASE_URL`, typed response). This plan adds that proxy layer.
- `main/review-center/due/page.tsx` is the only page with real SM-2 rating UI today
  (`_utils/review-routes.ts`, `RATING_OPTIONS` quality 0/2/4/5) — plain `fetch`/`useState`, no
  offline awareness, submits straight to `/api/review/rate`. It also has the known
  `max-w-lg`/`globals.css` spacing-token collision (`--spacing-lg` vs Tailwind's `max-w-lg`
  utility) noted in `CLAUDE.local.md` as unfixed pre-existing debt — line 108 of that file
  (`max-w-lg` on the context-sentence `<p>`). Fixing it is a one-line prerequisite folded into
  Stage 1 below since this plan touches that page anyway.
- Novu wiring: `packages/shared/src/notifications/novuClient.ts` defines the `NovuClient`
  interface (`upsertSubscriber`, `triggerNotification`, `deleteSubscriber`) —
  `services/notification-service/src/lib/novuClient.ts`'s `createLiveNovuClient` wraps `@novu/api`
  (`novu.subscribers.create`, `novu.trigger`, `novu.subscribers.delete`). No push-specific method
  exists yet. 4 `triggerNotification` call sites today: `learningPathReady.ts`,
  `achievementUnlocked.ts`, `dailyReminder.ts`, `vocabOfTheDay.ts` scheduler jobs.

## Design decisions

- **IndexedDB access via the `idb` package** (small, promise-based wrapper over the native
  callback API — avoid hand-rolling `IDBOpenDBRequest` boilerplate). Install into `apps/web`.
- **One DB, two object stores**: `english-academy-offline` DB, version 1 —
  - `dueCards` (keyPath `vocab_id`) — mirrors `flashcards_due` from the package endpoint, plus
    `sm2_state` merged in by `vocab_id` for local retrievability display. Read-heavy, fully
    replaced on every successful package fetch (not merged/diffed — the package endpoint is
    already a point-in-time snapshot, so treat each fetch as authoritative).
  - `pendingReviews` (keyPath `review_id`, a client-generated `crypto.randomUUID()`) — one row
    per queued-but-unsynced rating: `{ review_id, item_id, quality, reviewed_at, synced: false }`.
    Rows are deleted locally once the sync response confirms `applied` (matched by `review_id`),
    not just on a successful HTTP status — a partial-failure response (`errors` array) must leave
    the failed rows queued for retry.
- **Client-generated `review_id` is the idempotency key end-to-end** — generate it at write time
  (when the user taps a rating), not at sync time, so the same queued row can't double-submit
  across a retry.
- **Package caching is opportunistic, not blocking**: fetch-and-store on page load if online;
  render from IndexedDB immediately if present (stale-while-refetch), regardless of network
  state. Never block the UI on the network round-trip if a local copy exists.
- **Background Sync is progressive enhancement over a foreground fallback that must work
  standalone** (Safari has zero support for the Background Sync API, desktop or iOS) — the
  foreground `online` event listener path is not a lesser fallback bolted on later, it's the
  baseline both browsers get; Background Sync just means Chrome/Edge/Android users additionally
  get a flush while the tab is closed. Verify current support at implementation time (caniuse
  "Background Synchronization API").
- **Push notification storage**: default to a bespoke `push_subscriptions` table
  (`clerk_user_id`, `endpoint`, `p256dh`, `auth`, `created_at`) rather than routing through Novu.
  Checked at planning time: Novu's push-channel providers (FCM/APNs/Expo) are all
  native-mobile-oriented — none accept a raw W3C `PushSubscription` (endpoint + `p256dh`/`auth`
  keys) the way a self-issued VAPID setup needs, and `@novu/api`'s subscriber-credentials surface
  doesn't have a generic "raw web push" provider slot. **Confirm this against the live Novu
  dashboard's integration store before writing storage code** (providers change over time) — but
  plan for bespoke storage as the default, not a fallback. If disproven, Stage 4's storage
  sub-step is the only piece that changes; the client-side VAPID subscribe flow and SW handler
  are unaffected either way.
- **VAPID keys**: generate once (`npx web-push generate-vapid-keys` or `web-push` npm package),
  public key ships as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client-side, used in
  `pushManager.subscribe()`), private key stays server-side only — likely lives on
  `notification-service` (it already owns all 4 `triggerNotification` call sites) rather than a
  new service, added to `infra/.env`/`docker-compose.prod.yml` alongside the existing
  `NOVU_API_KEY` pattern.
- **Permission-prompt UX reuses `InstallPwaPrompt.tsx`'s exact dismissal pattern**: a
  `localStorage` timestamp key, 14-day re-prompt window, no nagging. New sibling component, not a
  merge into the install prompt (different trigger conditions, different permission APIs).

## Stage 1 — IndexedDB schema + read-only offline package caching

Files: `apps/web/package.json` (edit, add `idb`), new `apps/web/lib/offline/db.ts`, new
`apps/web/lib/offline/package.ts`, new `apps/web/app/api/offline/package/route.ts`,
`apps/web/app/main/review-center/due/page.tsx` (edit).

- `npm install idb --workspace apps/web`.
- `lib/offline/db.ts`: `openOfflineDb()` using `idb`'s `openDB`, version 1, creates `dueCards` and
  `pendingReviews` stores on `upgrade`. Typed via `idb`'s `DBSchema`.
- New proxy `app/api/offline/package/route.ts`, same shape as `app/api/review/due/route.ts`
  (Clerk `auth()` → `getToken()` → `apiFetch<OfflinePackage>('/offline/${userId}/package', {
  token })`). New `OfflinePackage` type in `lib/api/types.ts` matching the backend's exact
  response shape (`flashcards_due`, `sm2_state`, `highlight_snapshot`) — don't invent fields the
  backend doesn't return.
- `lib/offline/package.ts`: `syncPackageToIndexedDb()` — fetches `/api/offline/package`, on
  success clears and repopulates `dueCards` (fold `sm2_state` in by `vocab_id` for local
  retrievability). Called from `due/page.tsx`'s existing load effect when `navigator.onLine`.
- `due/page.tsx`: on mount, read `dueCards` from IndexedDB first and render immediately if
  non-empty (don't gate the initial render on the network call); kick off
  `syncPackageToIndexedDb()` in the background when online and re-render on completion. Falls
  back to today's `status: 'error'` state only when both IndexedDB is empty *and* the network
  fetch fails.
- **Prerequisite one-liner while touching this file**: fix the `max-w-lg` → `max-w-[28rem]`
  (or equivalent arbitrary-value class) collision on the context-sentence paragraph, matching the
  fix already applied to `InstallPwaPrompt.tsx`/the offline page in the parent plan.

**Acceptance:** DevTools → Application → IndexedDB shows `dueCards` populated after a load;
reloading with DevTools' network throttling set to "Offline" still renders the due-card queue
from the last successful fetch, not the error state.

## Stage 2 — Offline-queued rating writes

Files: `apps/web/lib/offline/reviews.ts` (new), `apps/web/app/api/offline/sync/route.ts` (new),
`apps/web/app/main/review-center/due/page.tsx` (edit).

- New proxy `app/api/offline/sync/route.ts`, POST, same auth pattern as the others — forwards
  `{ reviews }` to `/offline/${userId}/sync`, returns `{ applied, skipped, errors }` typed as a
  new `OfflineSyncResult` in `lib/api/types.ts`.
- `lib/offline/reviews.ts`:
  - `queueReview(item_id, quality)` — writes `{ review_id: crypto.randomUUID(), item_id, quality,
    reviewed_at: new Date().toISOString(), synced: false }` into `pendingReviews`. Called
    immediately on rating tap, optimistic — the UI advances to the next card without waiting on
    any network call.
  - `flushPendingReviews()` — reads all `pendingReviews`, POSTs them in one batch to
    `/api/offline/sync`, deletes rows whose `review_id` appears in the response's implied-applied
    set (the endpoint doesn't echo back which specific `review_id`s succeeded beyond aggregate
    counts + an `errors` array keyed by `review_id` — delete every row *not* present in `errors`,
    since `apply_offline_sync` only ever returns per-review failures for validation errors, never
    partial silent drops). Safe to call with an empty queue (no-op) and safe to call repeatedly
    (idempotent server-side).
- `due/page.tsx`'s `submitRating` changes from "await the POST, then advance" to "queue locally,
  advance immediately, best-effort trigger a flush if online" — this makes the page work
  identically whether the tap happens online or offline, closing the gap the naive online-only
  version had even before Background Sync exists.
- Register Background Sync here (`registration.sync.register('sync-offline-reviews')` on
  `queueReview`, feature-detected via `'sync' in registration`) even though the SW-side listener
  isn't wired until Stage 3 — registering it early with no listener is a harmless no-op, and
  keeps this stage's diff focused on the IndexedDB write path rather than mixing concerns.

**Acceptance:** with DevTools Offline enabled, rate several cards — `pendingReviews` shows the
queued rows; re-enable network and manually call `flushPendingReviews()` from the console (SW
trigger not wired yet) — rows clear, real due-vocab state changes in Postgres (`vocabulary_mastery`).

## Stage 3 — Background Sync + Safari-safe foreground fallback

Files: `apps/web/app/sw.ts` (edit), `apps/web/lib/offline/reviews.ts` (edit),
`apps/web/app/main/review-center/due/page.tsx` (edit, or lift to root layout — see below).

- `app/sw.ts`: add a `sync` event listener —
  `self.addEventListener('sync', (event) => { if (event.tag === 'sync-offline-reviews') {
  event.waitUntil(flushPendingReviews()) } })`. This requires `flushPendingReviews` (and its
  `idb` + `fetch` calls) to be importable/runnable inside the service worker context, not just
  the page — confirm `idb` works unmodified in a SW context (it does; no DOM dependency) and that
  the fetch target (`/api/offline/sync`) is reachable without a page-scoped auth token in memory.
  **Real wrinkle to resolve at implementation time**: the SW has no access to `getToken()` (a
  Clerk React hook) — the sync handler needs a way to get a fresh JWT without the page open.
  Options: (a) cache the last-known token in IndexedDB alongside the queue (short-lived, accept
  it may be stale by the time sync fires — risk of a 401), or (b) skip token refresh and let a
  401 from `/api/offline/sync` fail the sync event, which the browser will retry with backoff on
  next connectivity (Background Sync's built-in retry semantics) until the user reopens the app
  and a fresh flush succeeds with a live token. Prefer (b) — simpler, no token-staleness security
  question, and Background Sync retrying until the next foreground visit is an acceptable
  degradation, not a correctness bug (the foreground fallback below still saves the day for
  Safari and for any exhausted-retry case).
- `lib/offline/reviews.ts`: add a foreground `window.addEventListener('online',
  flushPendingReviews)` — registered once, e.g. from the root layout or a small client component
  mounted globally (not just `due/page.tsx`, so a queued rating still flushes even if the user
  navigated away before reconnecting). This is the mechanism Safari gets exclusively and every
  other browser gets as a second trigger alongside Background Sync.
- Feature-detect Background Sync support (`'serviceWorker' in navigator && 'SyncManager' in
  window`) before calling `registration.sync.register(...)` from Stage 2 — don't let it throw on
  Safari.

**Acceptance:** Chrome — queue a rating offline, close the tab entirely, reconnect network,
confirm (via server-side check, e.g. querying `offline_review_log`) the sync fired without
reopening the app. Safari — same offline-queue step, confirm nothing errors (no Background Sync
API), then reopening the app (or firing the `online` event) flushes the queue.

## Stage 4 — Web push notifications

Files: new `agents/migrations/0NN_push_subscriptions.sql`, new route on
`notification-service` (`POST/DELETE /internal/push-subscriptions` or similar — confirm shape at
implementation time), `apps/web/app/sw.ts` (edit), new
`apps/web/app/components/PushNotificationPrompt.tsx`, new
`apps/web/app/api/push/subscribe/route.ts`, `infra/.env`/`docker-compose.prod.yml` (edit, VAPID
keys), each of the 4 scheduler/consumer `triggerNotification` call sites (edit, add push send).

- **Confirm the Novu push-provider question from "Design decisions" first** — check the live
  Novu dashboard's integration store for a raw Web Push (VAPID) provider before writing any
  bespoke table. If none exists (expected per the pre-check above), proceed with bespoke storage.
- Generate a VAPID keypair once; public key → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; private key → a new
  env var (`VAPID_PRIVATE_KEY`) on `notification-service` only, following the same
  `infra/.env`-holds-the-real-value + `docker-compose.prod.yml`-injects-it pattern `NOVU_API_KEY`
  and `INTERNAL_SECRET` already use.
- New migration: `push_subscriptions (clerk_user_id TEXT, endpoint TEXT PRIMARY KEY, p256dh TEXT,
  auth TEXT, created_at TIMESTAMPTZ DEFAULT NOW())` — `endpoint` as the natural key since a
  browser can only have one active subscription per SW registration; re-subscribing (e.g. after
  clearing the key) naturally replaces the row via `ON CONFLICT (endpoint) DO UPDATE`.
- `PushNotificationPrompt.tsx`: same dismissal-pattern shape as `InstallPwaPrompt.tsx` (own
  `localStorage` key, 14-day window), feature-detects `'PushManager' in window`, on accept calls
  `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey:
  <converted VAPID public key> })`, POSTs the resulting `PushSubscription.toJSON()` to
  `/api/push/subscribe` (new Next proxy → a new `notification-service` endpoint that upserts into
  `push_subscriptions`, keyed off the Clerk-authenticated `clerkUserId` same as every other
  per-user write in this codebase).
- `app/sw.ts`: add a `push` listener (`event.data.json()` → `self.registration.showNotification(
  title, { body, icon: '/icons/icon-192.png', data: { url } })`) and a `notificationclick`
  listener (`event.notification.close()`, then `clients.openWindow(event.notification.data.url)`
  or focus an existing client if one's already open at that URL — check `clients.matchAll()`
  first per the standard pattern).
- Wire push as a send channel: the simplest integration point is inside `notification-service`'s
  existing 4 `triggerNotification` call sites — after (or instead of, per-workflow) the Novu
  in-app trigger, look up the user's `push_subscriptions` rows and send via the `web-push` npm
  package (handles VAPID signing) using the same private key. This is a second delivery path
  alongside Novu's in-app inbox, not a Novu-mediated one, given the provider gap found above.

**Acceptance:** grant permission via the prompt, confirm a row lands in `push_subscriptions`;
trigger one of the 4 existing notification events (e.g. `vocab-of-the-day` scheduler run) with
the tab/browser fully closed, confirm an OS-level notification tray entry appears; click it,
confirm it opens/focuses the app at the right page.

## Rollout

1. Stage 1 lands first — lowest risk (read-only), and includes the pre-existing `max-w-lg` fix
   this plan was already going to touch that file for.
2. Stage 2 (write queue) and Stage 3 (Background Sync + fallback) should land together or in
   immediate succession — Stage 2 alone leaves an optimistic local queue with no automatic flush
   trigger beyond a page reload, which is a regression in reliability perception vs. today's
   synchronous submit, even though data isn't lost. Don't ship Stage 2 without Stage 3 close
   behind it.
3. Stage 4 (push) is independent of 1–3 and can be built in parallel or afterward — no shared
   code beyond the service worker file and the dismissal-prompt pattern.
4. Each stage should be live-verified against the real Docker stack / real Postgres rows per this
   repo's existing convention (see `CLAUDE.local.md`'s "Recently landed" entries for the bar:
   query the actual table, don't just trust a 200 response), not just unit/typecheck-clean.

## Explicitly still out of scope

- Native app-store packaging (Trusted Web Activity, Capacitor) — no evidence of need.
- Periodic Background Sync (proactively refreshing due-count in the background on a schedule) —
  even narrower browser support than plain Background Sync, revisit only if Stages 1–4 land and
  there's a specific product ask.
- Offline support for anything beyond the due-review flashcard queue (e.g. offline exercise
  attempts, offline speaking) — AGT-07's offline package is scoped to flashcards/SM-2/highlights
  only; extending offline support to other content types is a separate backend scoping exercise,
  not a frontend-only follow-up like this plan.

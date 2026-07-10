# PWA Advanced Capabilities — Offline Sync, Background Sync, Push Notifications

## Status

Not started. Logged 2026-07-10 as the explicit follow-up to `docs/pwa-implementation-plan.md`
(Stages 1–6, core installability — done and live-verified on Vercel). This is a **scoping doc**,
not an implementation-ready plan like the parent doc — the goal is to let a future session start
from real context instead of re-deriving scope, not to hand it a step-by-step build order yet.
Writing that step-by-step breakdown is itself the first thing a session picking this up should do
(matching this repo's convention of persistent `docs/*.md` plans, see
`docs/pwa-implementation-plan.md` for the shape to follow).

Audience: frontend dev picking up PWA work again. Relates to: `docs/pwa-implementation-plan.md`
§1 ("Explicitly out of scope" — this doc is where those three items landed), `CLAUDE.local.md`
Phase 7 (AGT-07 offline sync backend, already done), the Novu inbox section (existing in-app
notification wiring, distinct from push).

## Why these three are bundled into one future pass

They were named separately in the parent plan's out-of-scope list, but they overlap enough that
splitting them into three separate sessions would mean re-touching the same code three times:

- **Offline data sync (IndexedDB) and Background Sync are two halves of one feature.**
  IndexedDB is where the user's offline actions (a flashcard rating, a review answer) get stored
  while there's no connection. Background Sync is the browser API that reliably flushes that
  queue to the backend once connectivity returns — *even if the user has closed the tab* — instead
  of only syncing when they happen to reopen the app. Building the IndexedDB queue without also
  wiring Background Sync leaves the sync trigger fragile (foreground-only, `online` event
  listener style); building them together means the queue-draining code gets written once.
- **All three extend the same service worker file** (`apps/web/app/sw.ts`, built in
  `docs/pwa-implementation-plan.md` Stage 3). A `push` event listener and a `sync` event listener
  are just more handlers registered on the same file — not a new subsystem, not a new build
  pipeline. Touching that file three times across three unrelated sessions is more overhead than
  touching it once with all three additions reviewed together.
- **Push notifications share little code with the other two**, but shares the same "browser
  support matrix and permission-prompt UX" class of problem the install-prompt work
  (`InstallPwaPrompt.tsx`) already established a pattern for (feature-detect, respect dismissal,
  don't nag). Reusing that pattern/UX convention for a notification-permission prompt is easier
  done in the same pass while it's fresh context, rather than rediscovering it later.

## 1. Deep offline data sync (IndexedDB)

**Backend is already done and waiting** — nothing on the frontend calls it yet:
- `GET /offline/{clerk_user_id}/package` (AGT-07) — packages due flashcards, their SM-2 state,
  and the latest highlight snapshot.
- `POST /offline/{clerk_user_id}/sync` (AGT-07) — replays queued reviews sorted by
  `reviewed_at` ascending through the same `rate_item()` SM-2 path as live rating. Idempotent via
  `offline_review_log` (migration `016`), keyed on a client-generated `review_id`,
  `INSERT ... ON CONFLICT DO NOTHING`.
- Kong route already exists: `agt07-offline` → `/api/offline` → `agt07-review:8107/offline`.

**What's missing, all frontend-only:**
- An IndexedDB schema/wrapper (the app has zero IndexedDB usage today — this is greenfield on the
  frontend, despite `apps/web/README.md` historically claiming it existed).
- A fetch-and-cache-the-package flow (probably triggered on app load or on the SW's install/sync
  lifecycle) storing the due-flashcard package locally.
- A local "rate this card" flow that writes to IndexedDB first (optimistic), generating the
  client-side `review_id` AGT-07's idempotency key expects.
- The actual sync-back call to `POST /offline/{id}/sync` — see §2 for how Background Sync makes
  this reliable instead of foreground-only.
- UI: `main/review-center/due/page.tsx` (the existing real due-vocab queue, per
  `CLAUDE.local.md`'s "Recently landed") is the natural page to make offline-capable first —
  smallest surface, already has the real SM-2 rating UI built.

## 2. Background Sync API (offline-submitted reviews)

Registers a sync request (`registration.sync.register('sync-offline-reviews')`) from the page
when a rating is queued while offline; the browser fires a `sync` event on the service worker
once connectivity returns, even if no tab is open, which then POSTs the queued reviews to AGT-07.

**Real caveat, decide early:** Safari has **no support for the Background Sync API at all** (not
Safari desktop, not iOS Safari) — this is a Chrome/Edge/Android-only enhancement, not a
cross-browser guarantee. Treat it as progressive enhancement layered on top of a plain "sync on
next foreground `online` event" fallback (which must exist anyway for Safari users), not as the
only sync mechanism. Check current support at implementation time (caniuse "Background
Synchronization API") since this has been slowly gaining ground.

## 3. Web push notifications

**Explicitly distinct from what already exists** — today's `NotificationInbox.tsx` /
`@novu/react`'s `<Inbox>` is in-app only (renders inside the app, requires the tab to be open).
Web push delivers a notification even when the browser/tab is closed, via the OS notification
tray — a different channel, different infra:

- VAPID keypair (generate once, store the public key client-side, private key server-side).
- Service worker gains a `push` event handler (parses the payload, calls
  `self.registration.showNotification(...)`) and a `notificationclick` handler (focuses/opens the
  right page).
- Backend needs somewhere to store each user's `PushSubscription` object (endpoint + keys) — no
  existing table for this; check whether Novu's own push provider integration (if it has one)
  can own this instead of a new table, before building bespoke storage. Novu supports a push
  channel via provider integrations (FCM, APNs, or raw Web Push) — worth checking whether Novu's
  existing account/SDK already in this project. If Novu's Web Push provider is possible to wire
  up, the storage problem may already be solved.
- A permission-request UX — reuse `InstallPwaPrompt.tsx`'s dismissal pattern (14-day
  `localStorage` memory, don't nag) rather than inventing a new one.
- Trigger points: this project already has 4 `triggerNotification` call sites
  (`learning-path-ready`, `achievement-unlocked`, `daily-reminder`, `vocab-of-the-day`, per
  `CLAUDE.local.md`'s Novu section) — adding push as a channel to those existing Novu workflows
  is likely far less work than building a parallel notification-sending path.

## Suggested sequencing within the bundle (rough — refine when this is actually picked up)

1. IndexedDB schema + read-only offline package caching first (lowest risk, no write-path
   correctness to get right yet).
2. Offline-queued rating writes + Background Sync flush, with the Safari-safe foreground fallback
   built at the same time (not as an afterthought).
3. Push notifications last — least code overlap with 1–2, and benefits from checking the Novu
   provider question above before writing any bespoke subscription storage.

## Explicitly still out of scope (don't fold into this either)

- Native app-store packaging (Trusted Web Activity, Capacitor) — no evidence of need.
- Periodic Background Sync (proactively refreshing due-count in the background on a schedule) —
  even narrower browser support than plain Background Sync, lower priority, revisit only if the
  three above land and there's a specific product ask for it.

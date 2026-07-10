# PWA Implementation Plan (`apps/web`)

## Status

**Stages 1–5 done and live-verified, 2026-07-10.** Deployed to Vercel (preview URL off the
`ui/pwa` branch, Root Directory `apps/web`); manifest, service worker, offline fallback, and the
install prompt all confirmed working against the real HTTPS deployment (not just localhost) —
including a real install via the browser's native prompt. Stage 6 (Lighthouse formal pass) is
the only thing not yet run. Stage 2's icons are still the placeholder monogram, real logo pending
per that stage's original scope.

Three real bugs surfaced and fixed getting here, all confirmed via reproduce-then-fix rather than
guessing:
- Serwist + Next 16's default Turbopack builder don't work together via `@serwist/next`'s
  webpack-plugin integration (hard build failure) — switched to `@serwist/turbopack`'s
  route-handler-based integration (`app/serwist/[path]/route.ts`) instead of `app/manifest.ts`'s
  originally-planned static `public/sw.js` output.
- Two pre-existing, PWA-work-unrelated monorepo build gaps only surfaced on a genuinely fresh
  Vercel checkout (local builds masked them via stale artifacts/hoisting): `packages/shared`'s
  `dist/` isn't committed and nothing built it before `apps/web`'s build ran (fixed via a
  `prebuild` script), and `tsup` was only declared as a root-level devDependency instead of
  `packages/shared`'s own (fixed by declaring it there directly).
- `app/globals.css`'s pre-existing custom `--spacing-md`/`-lg` theme tokens collide with
  Tailwind v4's `max-w-md`/`-lg` utilities (same namespace fallback) — broke both the install
  banner's and the offline page's layout. Fixed locally by switching to arbitrary-value classes
  (`max-w-[28rem]`) in the two files this plan touches; `main/review-center/due/page.tsx` has the
  same latent bug and was left alone as out-of-scope pre-existing debt.

Audience: frontend dev (`apps/web` is a separate, mostly-independent track per
`CLAUDE.local.md` — this plan is scoped entirely to that app; no backend/TS-service or
`agents/` changes are required to complete it, see Stage 5 for the one cross-cutting exception).

Relates to: `docs/minor-frontend-todo.md` item 3 ("mobile view for PWA", done — responsive
layout/hamburger menu, a UX prerequisite this plan builds on but does not redo),
`apps/web/README.md` (currently describes the app as already "packaged as a Progressive Web
App" — stale, corrected alongside this plan), root `README.md` §"Công nghệ dự kiến" (product
spec's PWA vision — this plan is the first concrete step toward it, not a re-litigation of the
decision to build a PWA).

## 0. Why this doc exists — current state audit

Audited 2026-07-10 against the actual code (not the README's aspirational framing). `apps/web`
today is a responsive **website**, not an installable PWA — none of the three installability
requirements are met, and none of the supporting infrastructure exists:

| Requirement | Status |
|---|---|
| Web app manifest | ❌ None. No `manifest.json`/`app/manifest.ts`, no `<link rel="manifest">` in `app/layout.tsx`. |
| Service worker | ❌ None. No `public/sw.js`, no registration code, no `next-pwa`/`@serwist/next`/Workbox dependency in `package.json`. |
| Icons | ❌ Only `app/favicon.ico`. No 192×192/512×512 PNGs, no maskable variant, no `apple-touch-icon`. `apps/web/public/` doesn't currently exist. No logo/brand asset exists anywhere in the repo to generate them from. |
| HTTPS (prod) | ⚠️ Unverified — no `vercel.json` or other deploy config checked into the repo. `apps/web/README.md`'s boilerplate "Deploy on Vercel" section suggests Vercel is the intended target (Vercel serves HTTPS by default), but this isn't confirmed as the actual live deployment. |
| Offline data (IndexedDB) | ❌ None. `apps/web/README.md` already claims "IndexedDB for offline flashcards/highlights" — aspirational, not real. Backend support exists (AGT-07's `GET/POST /offline/{clerk_user_id}/package,sync`, done per `CLAUDE.local.md` Phase 7) but nothing in `apps/web` calls it. |
| Meta tags (`theme-color`, `apple-mobile-web-app-capable`, Next.js `viewport` export) | ❌ Only a plain `<meta name="viewport">` tag in `app/layout.tsx`. No `theme-color`, no iOS-specific meta, no Next.js `viewport` export (Next 14+ separated this from `metadata`). |
| Mobile-responsive UI | ✅ Done (`docs/minor-frontend-todo.md` #3) — hamburger menu, retractable side-drawer, scaled layout. A UX prerequisite, not itself what makes a site installable. |

## 1. Scope & non-goals

**In scope:** installability (manifest + icons + service worker + a verified-HTTPS prod
environment), app-shell precaching, a basic offline fallback page, an install-prompt UX, and a
passing Lighthouse installability check.

**Explicitly out of scope** (real features — logged together in
`docs/pwa-offline-sync-and-push-plan.md` for a future session, don't fold them into this one):

- **Deep offline data sync** — IndexedDB-backed flashcard/highlight review while offline, wired
  to AGT-07's existing `/offline/{clerk_user_id}/package` + `/sync` endpoints. The backend is
  ready; this is a frontend-only follow-up once basic installability lands.
- **Background sync** for offline-submitted answers/reviews — pairs directly with the item
  above (Background Sync is what reliably flushes the IndexedDB queue once connectivity
  returns); Safari has no support for this API at all, see the linked doc.
- **Web push notifications** — VAPID keys, a service worker `push` event handler, backend
  subscription storage, and a Novu web-push provider configuration. Today's Novu wiring
  (`NotificationInbox.tsx`) is in-app inbox only; push is a distinct channel.
- **Native app-store packaging** (Trusted Web Activity, Capacitor, etc.) — not requested, no
  evidence of need beyond "installable from the browser."

## 2. Design decisions

- **Manifest via Next.js's `app/manifest.ts` convention**, not a hand-maintained
  `public/manifest.json`. Next.js generates `/manifest.webmanifest` and links it automatically —
  one less thing to keep in sync by hand.
- **Service worker via `@serwist/next`**, not `next-pwa`. `next-pwa` is unmaintained and known to
  fight Turbopack; Serwist is the actively maintained successor, supports the App Router, and
  injects the precache manifest at build time. Pin an exact version and confirm Next.js 16.2.9
  compatibility at implementation time (see Open Questions — Next 16 is very new).
- **Runtime caching is resource-class-specific, not blanket:**
  - `_next/static/*` and other content-hashed build assets → CacheFirst, long TTL (safe — the
    hash changes on any real change).
  - Google Fonts stylesheet/font files (already preconnected in `layout.tsx`) → StaleWhileRevalidate.
  - Same-origin GET `/api/*` (catalog, vocab, review-center bundle, etc.) → NetworkFirst, short
    cache (~5 min), short network timeout before falling back to cache.
  - **Never cached**: any non-GET request, and anything under `/api/orchestrate/*` or
    `/api/speaking/*` specifically — mutating and session/identity-sensitive traffic must never
    be served stale or from a shared cache.
- **Service worker registers in production builds only** (`disable: process.env.NODE_ENV ===
  "development"`, Serwist's standard pattern). `next dev` stays exactly as it behaves today —
  no cache-busting workflow needed during active development.
- **Icons ship as a placeholder monogram for now** (decided 2026-07-10). No logo/brand mark
  exists anywhere in this repo — rather than block on real branding, Stage 2 generates a simple
  text/monogram icon (e.g. "EA" on the `theme_color` background) in all required sizes. This is
  explicitly a placeholder: swapping it for a real logo later only touches the PNG files in
  `apps/web/public/icons/`, nothing else (manifest/layout references stay the same paths).
- **theme_color / background_color reuse existing design tokens** from `app/globals.css` rather
  than inventing new brand colors: `theme_color: #0f62fe` (`--color-primary`),
  `background_color: #f7fafc` (`--color-background`).
- **`display: "standalone"`, no orientation lock** — the app is used on desktop too (per the
  existing responsive layout work), so locking to portrait would regress that.
- **`lang: "vi"`**, matching `<html lang="vi">` already set in `app/layout.tsx`.

## Stage 1 — Web app manifest

Files: `apps/web/app/manifest.ts` (new), `apps/web/app/layout.tsx` (edit).

- New `app/manifest.ts` exporting a `MetadataRoute.Manifest`: `name`, `short_name`,
  `description`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `background_color`,
  `theme_color`, `lang: "vi"`, `categories: ["education", "productivity"]`, and an `icons` array
  (populated once Stage 2's assets exist — this stage can land with a partial/placeholder icons
  array and be completed in Stage 2, or the two stages can land together; either order is fine).
- `app/layout.tsx`: add a `viewport` export (`themeColor` from the same token,
  `colorScheme: "light"` matching the `className="light"` already forced on `<html>`). Add
  `appleWebApp: { capable: true, statusBarStyle: "default", title: "English Academy" }` to the
  existing `metadata` export for iOS installed-app chrome (status bar style, home-screen title).
  Next.js auto-links the manifest once `app/manifest.ts` exists — no manual `<link>` tag needed.

**Acceptance:** `next build && next start`; DevTools → Application → Manifest shows all fields
populated with no manifest errors; Lighthouse's installability check passes except for icons
(blocked on Stage 2).

## Stage 2 — Icons (placeholder monogram, real logo swapped in later)

**Resolved 2026-07-10:** no logo/brand mark exists anywhere in the repo (checked
`apps/web/public`, `apps/web/app/`, repo root — only `app/favicon.ico`). Rather than block on
real branding, ship a placeholder text/monogram icon (e.g. "EA" on the `theme_color` background,
`#0f62fe`) now; swap in a real logo later without touching the manifest/layout wiring.

Generate the placeholder (or, later, the real logo) into `apps/web/public/icons/`:

- `icon-192.png`, `icon-512.png` — `purpose: "any"`.
- `icon-maskable-192.png`, `icon-maskable-512.png` — `purpose: "maskable"`, with the extra
  safe-zone padding maskable icons require (verify against maskable.app or equivalent).
- `apple-icon-180.png` — iOS home screen, via Next.js's `app/apple-icon.png` convention or an
  explicit `<link rel="apple-touch-icon">`.
- Leave `app/favicon.ico` as-is for the browser tab (already multi-resolution).

Reference all PNG variants in `app/manifest.ts`'s `icons` array with correct `sizes`/`type`/
`purpose`.

**Acceptance:** Lighthouse installability check fully green; a DevTools "Add to Home Screen"
preview renders the real icon, not the default globe/placeholder.

## Stage 3 — Service worker (Serwist)

Files: `apps/web/next.config.ts` (edit), `apps/web/app/sw.ts` (new),
`apps/web/app/offline/page.tsx` (new), `apps/web/package.json` (edit).

- `npm install @serwist/next serwist --workspace apps/web`. Pin an exact version; confirm Next.js
  16.2.9 compatibility against Serwist's own changelog/issues before pinning (see Open
  Questions).
- Wrap `next.config.ts` with `withSerwist({ swSrc: "app/sw.ts", swDest: "public/sw.js", disable:
  process.env.NODE_ENV === "development" })`.
- `app/sw.ts`:
  - `precacheAndRoute(self.__SW_MANIFEST)` — Serwist's injected build manifest (app shell, JS/CSS
    chunks).
  - Runtime caching rules per the resource-class table in §2 above, starting from Serwist's
    `defaultCache` array and customizing it — don't hand-roll routing logic Serwist already
    provides a tested default for.
  - Register an offline fallback: a small precached `app/offline/page.tsx` ("You're offline —
    some features need a connection") served when a navigation request fails with no cache
    match. This is a minimal fallback, not a full offline app shell — deep offline support is
    explicitly out of scope (§1).
- Confirm at implementation time whether Serwist writes its compiled output into
  `apps/web/public/sw.js` (per the `swDest` above) or elsewhere, and add that generated file to
  `.gitignore` — don't commit generated service worker code.

**Acceptance:** `next build && next start`; DevTools → Application → Service Workers shows an
activated worker; reloading with DevTools' "Offline" checkbox still renders the last-visited
page (or the offline fallback for a fresh navigation); Network tab shows repeat `/api/*` GETs
served `(ServiceWorker)`; a POST to `/api/speaking/*` or similar always hits the network, never
served from cache.

## Stage 4 — Install prompt UX

Files: new `apps/web/app/components/InstallPwaPrompt.tsx` (confirm exact shared-components path
at implementation time — `apps/web/app/components/` per current layout), wired into the root
layout or homepage.

- Listen for `beforeinstallprompt` (Chrome/Edge/Android), stash the event, show a dismissible
  in-app banner/button ("Cài đặt ứng dụng", matching the app's Vietnamese UI) that calls
  `event.prompt()` on click.
- iOS Safari has no `beforeinstallprompt`. Detect iOS + not-already-installed
  (`navigator.standalone === false`) and show static "Add to Home Screen" instructions instead
  (Share icon → Add to Home Screen) — the only install path Apple exposes.
- Respect dismissal (a `localStorage` flag, don't reprompt for N days after dismissal) so it
  isn't naggy.

**Acceptance:** manual check in Chrome desktop/Android (native + custom prompt both work);
manual check in iOS Safari (instructions shown, no broken reliance on `beforeinstallprompt`).

## Stage 5 — HTTPS / deployment (Vercel — decided 2026-07-10) — ✅ done

`apps/web` has never been deployed publicly (confirmed — see detail section below); the decision
is to deploy it to **Vercel**, matching the boilerplate "Deploy on Vercel" section already in
`apps/web/README.md`. Concrete setup:

- Create a Vercel project pointed at this repo, with **Root Directory set to `apps/web`**
  (monorepo — Vercel needs this so it runs the build from the right workspace; it auto-detects
  the npm-workspaces `package-lock.json` at the repo root and installs from there).
- Build command: `npm run build` (Next.js default, already what `apps/web/package.json` defines
  — no override needed unless Vercel's monorepo auto-detection gets it wrong, check the actual
  detected settings before overriding anything).
- Environment variables to set in the Vercel project (mirror `apps/web/.env.example`, with real
  values instead of `localhost` ones): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
  `NEXT_PUBLIC_CLERK_SIGN_IN_URL`/`SIGN_UP_URL`/`*_FORCE_REDIRECT_URL`,
  `NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER`, `NOVU_API_KEY`, and — the two that matter most for
  this to actually function — `NEXT_PUBLIC_API_BASE_URL`/`API_BASE_URL` (Kong's public URL) and
  `NEXT_PUBLIC_SPEAKING_WS_BASE_URL` (AGT-03's public WS URL).
- Vercel gives the project a `*.vercel.app` HTTPS domain automatically (or a custom domain if one
  gets attached later) — this satisfies the service-worker secure-context requirement with no
  additional TLS work needed on the frontend side.

**Important cross-cutting caveat, not solved by this plan:** deploying `apps/web` to Vercel only
gives the *frontend* a public HTTPS origin. `NEXT_PUBLIC_API_BASE_URL`/`API_BASE_URL` and
`NEXT_PUBLIC_SPEAKING_WS_BASE_URL` currently default to `localhost` — for the deployed app to be
functional (not just installable), Kong and the full backend (TS services + `agents/` stack)
need to be publicly reachable over HTTPS/WSS too, which is a separate, larger infra task with no
groundwork laid anywhere in the repo (no public Kong domain, no TLS termination in front of it,
no deployment target chosen for the backend). That's out of scope for this plan — it's a
pre-existing gap in the project (the app has apparently never been deployed, backend included),
not something introduced by going PWA. Practically, this means Stage 5's specific acceptance
criteria below (service worker registers, secure context) can be verified on the Vercel
deployment even before the backend is reachable — manifest/service-worker registration doesn't
require the API to respond, only actual page functionality does.

**Acceptance:** Vercel deployment is live at its `*.vercel.app` URL; DevTools on that URL shows
a registered service worker and a secure connection (padlock); Lighthouse's installability
checks pass against that URL. Full end-to-end functionality (pages that need real API data)
is explicitly gated on the separate backend-deployment gap above, not this plan.

**Done, 2026-07-10** — live-verified by the user against the real deployed URL (behind Vercel
Deployment Protection, so verified manually rather than by this session's automation): secure
padlock present, service worker registers, manifest correct, offline fallback shows the real
`/offline` page on a genuinely uncached navigation, and — the one thing headless Chrome couldn't
prove locally — the native `beforeinstallprompt` banner fired for real and a real install
completed successfully. API/WS base URLs were deliberately left pointed at `localhost` per the
Stage 5 decision above; pages needing real backend data are expected to be non-functional on this
deployment and that's not a bug.

## Stage 6 — Lighthouse / final acceptance

- Run Lighthouse's installability checks (Chrome DevTools or `npx lighthouse <url> --view`)
  against a production build. Note: recent Lighthouse versions dropped the dedicated PWA
  category/badge in favor of manual installability criteria — confirm what's actually measurable
  at implementation time rather than chasing a deprecated score.
- Manual install smoke test: Android Chrome (native install banner), desktop Chrome/Edge (install
  icon in the omnibox), iOS Safari (Add to Home Screen via Stage 4's instructions) — confirm the
  installed app opens standalone (no browser chrome) with the correct icon, name, and theme
  color.
- `npm run lint --workspace apps/web`, `npm run build --workspace apps/web` clean.

## Open questions (block full completion, don't block starting)

1. ~~Source icon/logo asset~~ — **resolved 2026-07-10**: ship a placeholder monogram now (Stage
   2), swap for a real logo whenever design delivers one.
2. ~~Production HTTPS hosting target~~ — **resolved 2026-07-10**: deploy `apps/web` to Vercel
   (see Stage 5 for setup detail and the backend-reachability caveat that comes with it).
3. **Serwist + Next.js 16.2.9 compatibility** — Next 16 is very new; verify Serwist's supported
   Next.js range before pinning a version (Stage 3). Only remaining open question.

**Why the HTTPS question needed unpacking rather than a quick answer (context kept for the
record):** service workers — the thing that actually makes installability, offline caching, and
the app-shell precaching in Stages 3–4 work — only register in a browser "secure context":
`https://` or `http://localhost`, no partial-support state in between. That `localhost` exemption
is why Stages 1–4 don't need this question answered to be built and verified locally, but it also
means local testing alone could never have caught a prod-only failure here. Going looking for the
actual target (not just noting "unconfirmed") turned up no `Dockerfile` for `apps/web` (every
backend service has one), no entry for it in `infra/docker-compose.yml`/`docker-compose.prod.yml`,
no `.github/workflows`, no `vercel.json`/Netlify/Render/Fly config, and only `localhost` URLs in
`.env.example` — i.e. no evidence `apps/web` had ever been deployed publicly at all. That reframed
the question from "which HTTPS provider" to "has this been deployed anywhere yet, and if not,
where" — resolved above as Vercel.

## Rollout

1. Stages 1–4, including the Stage 2 placeholder icons, can all be built and fully verified on
   `localhost` — land those first, no flag needed (all additive, no existing behavior changes).
2. Stage 5 (Vercel deployment) can happen in parallel with or after Stages 1–4 — it's project
   setup (Vercel project, env vars), not a code dependency of the others.
3. Stage 6 is the final sign-off once Stages 1–5 are all in place, run against the real Vercel
   URL.
4. Real logo swap-in (replacing Stage 2's placeholder) and the backend-reachability work flagged
   in Stage 5's caveat are both follow-ups, tracked separately, not blockers on calling this plan
   done.

# Dark Mode — Full Rollout

Status: done, drafted and landed 2026-07-13, branch `ui/darkmode` (not yet merged). All 6 stages
complete: infra, shell/high-traffic pages, Practice Center, Review Center, Onboarding+Auth, QA.
Also covered the marketing landing page (`app/page.tsx`) and a data-file gap
(`onboarding/_data/onboarding-content.ts`) found during QA — neither was in the original file
inventory, both added once found. `npx tsc --noEmit` / `eslint .` / `next build` all clean
(4 pre-existing unrelated warnings only). Live-verified with a real headless-browser script
(Playwright, no project browser-driving skill existed) against `/`, `/auth/sign-in`,
`/auth/sign-up`, `/offline` in both themes — authenticated `/main/**` and `/onboarding/**` pages
could not be live-verified (no test Clerk credentials available in this environment); their
correctness rests on tsc/eslint/build passing plus the same now-proven-correct token convention
used throughout.
Audience: frontend dev implementing/continuing dark mode on `apps/web`
Relates to: `docs/pwa-implementation-plan.md` (`viewport.themeColor` pattern touched here),
`CLAUDE.local.md` "Known issues" (`main/review-center/due/page.tsx`'s pre-existing `max-w-lg`
spacing collision — unrelated bug, not this plan's to fix, noted only so it isn't confused with
dark-mode breakage when that page is touched in Stage 4)

## 0. Why this doc exists / current state

The app has almost no *working* dark mode today, despite scattered scaffolding. Verified against
code on branch `ui/darkmode` (currently identical to `main`) on 2026-07-13:

- Tailwind v4's `@custom-variant dark (&:where(.dark, .dark *))` is declared in
  `app/globals.css:3` — the mechanism `dark:` utilities need — but **nothing ever adds the `dark`
  class to anything**. `<html>` in `app/layout.tsx` is hardcoded `className="light ..."`. No
  toggle, no `next-themes`, no localStorage read, no system-preference detection exists anywhere.
- `globals.css:167-172` has a `:root.dark { --color-background: ...; --color-on-background: ...; }`
  block that is dead (nothing ever sets `.dark` on `:root`) *and* inconsistent with the pattern
  actually used elsewhere — a leftover from an abandoned CSS-variable-swap approach. Delete it,
  don't extend it.
- The pattern that **is** already established, in the 6 files that do have `dark:` classes
  (`app/layout.tsx`, `app/components/DashboardTopBar.tsx`, `app/components/SideMenu.tsx`,
  `app/components/MainShell.tsx`, `app/main/settings/page.tsx`, `app/main/homepage/page.tsx`), is
  **per-utility Tailwind `dark:` variants**, picking an alternate Material-3 token per element
  (e.g. `bg-surface dark:bg-inverse-surface`, `text-on-surface-variant dark:text-surface-dim`) —
  not a CSS-variable swap. This plan continues that pattern for every new file, for consistency.
- Coverage is minimal: of 72 `.tsx` files under `app/main`, `app/onboarding`, `app/auth`,
  `app/offline`, only 2 (`settings`, `homepage`) have any `dark:` classes. Everything under
  `app/main/practice-center/**` (~20 files), `app/main/review-center/**` (~17 files), and
  `app/onboarding/**` (~16 files) has zero dark-mode styling.
- No theme toggle UI exists anywhere.
- No `@clerk/themes` package is installed — Clerk-rendered UI (`UserProfile` in
  `app/main/profile/page.tsx`, `<SignIn>`/`<SignUp>` in `app/auth/**`) won't follow Tailwind
  `dark:` classes at all; needs Clerk's own `appearance.baseTheme` swapped.
- No `theme` field exists on User Service's settings model
  (`services/user-service/prisma/schema.prisma`) — no backend persistence today.
- `viewport.themeColor` in `app/layout.tsx` is a single static value. Next supports an array of
  media-scoped entries (`{ media: '(prefers-color-scheme: dark)', color }`) for automatic
  light/dark browser-chrome coloring — currently unused.

## 1. Decisions

- **Scope: full rollout** — infra plus every screen in this pass, not a partial slice left for a
  future session.
- **Toggle: 3-way Light / Dark / System**, default `'system'`.
- **Storage**: localStorage key `english-academy:theme` holding `'light' | 'dark' | 'system'`.
  Purely device-local for v1 — no backend field, no cross-device sync (a presentation preference
  doesn't justify a schema migration + API round trip yet). Flag as a possible follow-up only if
  cross-device sync is later requested.
- **FOUC prevention**: a blocking inline `<script>` in `app/layout.tsx`'s `<head>`, executed before
  hydration, reads localStorage + `matchMedia('(prefers-color-scheme: dark)')` and sets
  `document.documentElement.classList` synchronously. Remove the hardcoded `light` from `<html
  className>`.
- **Client state**: a `useSyncExternalStore`-based `useTheme()` hook — mirrors the existing
  localStorage/sessionStorage external-store idiom already in `app/components/DashboardTopBar.tsx`
  for `mainSectionStorageKey`, same shape, new key — reads/writes the localStorage key, listens
  for `matchMedia` changes when in `'system'` mode, toggles the `dark` class on
  `document.documentElement`.
- **Toggle UI**: new `app/components/ThemeToggle.tsx`, a Material-Symbols icon button (sun/moon/
  auto) cycling Light → Dark → System, in `DashboardTopBar.tsx`'s icon cluster next to
  `<NotificationInbox />` (visible on every authenticated page), plus a second explicit preference
  row in `main/settings/page.tsx` alongside the existing language/timezone settings.
- **`viewport.themeColor`**: becomes the 2-entry light/dark array form.
- **Clerk theming**: install `@clerk/themes`, wrap `ClerkProvider` in a small client component
  (`ClerkThemeProvider.tsx`) that reads `useTheme()` and passes `appearance={resolvedTheme ===
  'dark' ? dark : undefined}` conditionally (the `dark` object from `@clerk/themes` is a full
  `Theme`, passed directly as `appearance` — not nested under a `baseTheme` key; this SDK version
  (`@clerk/nextjs` 7.5.x / `@clerk/react`'s newer "core 2" types) renamed that concept to
  `theme`/passing the theme object directly, `baseTheme` doesn't exist on its `Appearance` type),
  so `<SignIn>`/`<SignUp>`/`<UserButton>` follow the app theme by default; verify whether
  `UserProfile` in `profile/page.tsx` inherits this or needs its own `appearance` override.
- PWA manifest (`app/manifest.ts`) `background_color`/`theme_color` stay single-valued (manifest
  spec has inconsistent dark-mode support across browsers) — only the `<meta name="theme-color">`
  viewport entries get light/dark variants.
- No automated visual regression testing added — manual QA only, matching this repo's existing
  test posture for `apps/web`.

## 1.5 Two real bugs found during Stage 1/2 live verification (2026-07-13)

Live-verified with Playwright against a real `next dev` server (no project browser-driving skill
existed for this repo; a scratch Playwright script was used instead, following the `run` skill's
generic browser-driven-app fallback). Both are fixed; do not reintroduce either pattern in later
stages.

1. **`globals.css` had a "Color helper utilities" block (previously lines 111-127) that
   hand-duplicated 15 classes Tailwind's `@theme` already auto-generates** (`bg-background`,
   `bg-surface`, `bg-surface-container-lowest`, `bg-inverse-surface`, `bg-primary-container`,
   `bg-secondary-container`, `bg-tertiary-container`, `bg-error-container`, `text-on-background`,
   `text-on-surface`, `text-on-surface-variant`, `text-primary`, `text-secondary`,
   `text-tertiary`, `text-error`). Because these were unlayered plain CSS (written after
   `@import "tailwindcss"` but outside any `@layer` block), CSS Cascade Layers rules made them
   **always beat any Tailwind-generated `dark:` utility for the same property**, regardless of
   whether the `dark` class was present — so every one of these 15 class names silently ignored
   its `dark:` pairing everywhere in the app, including in the pre-existing 6 "already styled"
   files. Confirmed via `getComputedStyle` before/after: `body`'s background stayed
   `rgb(247,250,252)` (light) with `dark` class active and `dark:bg-inverse-surface` present,
   until the block was deleted, after which it correctly resolved to `rgb(47,49,51)`
   (`inverse-surface`). **Fix: deleted the whole block** — Tailwind's `@theme` already generates
   identical utilities for every one of these names from their `--color-*` tokens, properly
   layered so `dark:` variants work normally. Verified `tsc`/`build`/light-mode screenshot
   unchanged after deletion.
2. **`app/auth/layout.tsx` has its own `bg-background` wrapper div with no `dark:` variant**,
   sitting between `<body>` (which does have the pairing) and the page content — it shadowed the
   body's dark background on `/auth/sign-in`/`/auth/sign-up`. Fixed:
   `dark:bg-inverse-surface` added. This file wasn't in the original Stage 5 file list (only the
   sign-in/sign-up pages were) — added to Stage 5's scope.

Also confirmed working correctly via screenshot: the `@clerk/themes` `dark` theme wiring from
Stage 1 (`ClerkThemeProvider.tsx`) — the Clerk sign-in card renders genuinely dark with legible
light text once the wrapping page background is fixed.

The two new `surface-dark` / `surface-dark-high` tokens (§1 design decisions) added for real card
elevation are unaffected by either bug (never hand-duplicated, pure Tailwind-generated) and are
confirmed correct in the screenshot.

## 2. Staged plan

### Stage 1 — Theme infrastructure
- `app/components/ThemeProvider.tsx` (or `lib/theme.ts` + thin client wrapper): the
  `useSyncExternalStore` hook, localStorage read/write, `matchMedia` subscription, applies/removes
  `dark` on `document.documentElement`.
- Inline blocking script in `app/layout.tsx`'s `<head>`; remove hardcoded `light` from `<html
  className>`.
- Remove dead `:root.dark` block, `globals.css:166-172`.
- `app/components/ThemeToggle.tsx`; wire into `DashboardTopBar.tsx`'s icon cluster (near the
  `<NotificationInbox />` usage) and into `main/settings/page.tsx` as a preference row.
- `viewport.themeColor` → light/dark array in `app/layout.tsx`.
- Install `@clerk/themes`; wrap `ClerkProvider` with theme-aware `appearance.baseTheme`.
- Verify: toggle flips `dark` class and persists across reload; a fresh profile with OS dark mode
  picks up dark on first load with no stored preference; no FOUC on hard refresh in either OS
  mode; no hydration-mismatch console warnings.

### Stage 2 — Shell + high-traffic pages
- Spot-check the 2 already-partial files (`homepage`, `settings`) still render correctly next to
  new infra.
- Add `dark:` coverage: `app/main/progress/page.tsx`, `app/main/review-center/page.tsx` (hub),
  `app/main/practice-center/page.tsx` (hub), `app/main/about/page.tsx`, `app/main/help/page.tsx`,
  `app/main/profile/page.tsx` (+ confirm Clerk `UserProfile` theming), `app/offline/page.tsx`.

### Stage 3 — Practice Center (~20 files)
- `app/main/practice-center/{reading,listening,writing,speaking}/page.tsx`,
  `app/main/practice-center/[skill]/modules/[moduleId]/page.tsx`,
  `app/main/practice-center/speaking/history/**`, and all of
  `app/main/practice-center/_components/*` (ModuleCard, QuestionPanel, AnswerOption, SkillCard,
  ExerciseWorkspace, TranscriptThread, SpeakingChat, SpeakingSidebar, TheoryPanel,
  FeedbackInsightCard, PracticeHero, BreadcrumbBar, ExerciseNavigation, ConversationHistoryList,
  EditableConversationTitle, ModuleList).

### Stage 4 — Review Center (~17 files)
- `app/main/review-center/{due,flashcards,grammar}/**` (incl. `[topicId]`, `[topicId]/study`,
  `[categoryId]`, `[categoryId]/[lessonId]`) and all of `app/main/review-center/_components/*`
  (FlashcardTopicCard/Grid, GrammarSection/LessonView/TopicCard, ReviewHero,
  ProgressSummaryCard, FlashcardGrid/Study, ReviewFeatureCard, ReviewEmptyState).

### Stage 5 — Onboarding + Auth (~18 files)
- `app/onboarding/{goals,level,plan,assessment,assessment/results,self-assessment,preferences}/page.tsx`
  and all of `app/onboarding/_components/*` (OnboardingShell, OnboardingProvider,
  OnboardingProgress, OnboardingAccessGate, ChoiceCard, SkillSelector, TimeCommitmentSlider,
  AssessmentQuestion, GeneratedPlanPreview, CompleteOnboardingLink).
- `app/auth/sign-in/[[...sign-in]]/page.tsx`, `app/auth/sign-up/[[...sign-up]]/page.tsx` — mostly
  bare Clerk components; verify Stage 1's Clerk theme wiring covers these before adding custom
  markup. `app/auth/layout.tsx` already fixed (§1.5) — its `bg-background` wrapper now has
  `dark:bg-inverse-surface`.

### Stage 6 — QA pass
- Manual toggle sweep (Light/Dark/System, both directions) across every route touched in Stages
  2–5.
- Cold load with OS set to dark and to light, no stored preference, to confirm system detection.
- Check contrast on decorative/gradient elements (homepage's tertiary/primary gradient CTA card
  already has `dark:` handling — confirm the same care is applied anywhere similar gradients
  appear in practice-center/review-center).
- Confirm PWA installed-mode status bar color follows Stage 1's `viewport.themeColor`.
- Confirm no hydration-mismatch warnings from the inline theme script.
- `npm run lint` / `tsc --noEmit` / `npm run build` in `apps/web`.

## 3. Verification

- `npm run lint` / `tsc --noEmit` in `apps/web` after each stage.
- `npm run build` at the end (Stage 6) to catch anything lint/typecheck miss.
- Manual browser verification: dev server, drive the toggle through Light/Dark/System on
  representative pages from each stage; also check a production build (`next build && next
  start`) for the FOUC/system-detect checks in Stage 6, since SW/script behavior can differ from
  `next dev` (per prior PWA work notes in `CLAUDE.local.md`).

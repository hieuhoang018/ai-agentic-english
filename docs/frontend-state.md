# Frontend State Snapshot

Last updated: 2026-06-18

## Overview

The frontend is a Next.js App Router application in `apps/web/app`, using React 19, Next.js 16, Tailwind CSS 4, and Clerk for authentication. The UI is currently implemented with typed mock data and local client state where needed. Backend feature endpoints are not yet integrated for learning materials, progress persistence, AI feedback, speech/audio, or review-center updates.

The product shell is split into:

- Public landing/auth pages under `apps/web/app`.
- Onboarding pages under `apps/web/app/onboarding`, outside the dashboard sidebar shell.
- Authenticated dashboard pages under `apps/web/app/main`, using the shared sidebar and top bar.

## Current Route Coverage

### Public And Auth

- `/`: landing page.
- `/auth/sign-in`: Clerk sign-in page.
- `/auth/sign-up`: Clerk sign-up page.

Current auth behavior:

- Sign up redirects to `/onboarding/goals?fresh_signup=1`.
- Sign in redirects to `/main/homepage`.
- The auth layout header links to sign up, not directly to onboarding.
- Direct access to `/onboarding/*` while signed out redirects to sign up.
- Direct signed-in access to `/onboarding/*` is blocked unless the current browser session was started by the fresh sign-up redirect.
- Completing the generated plan marks onboarding complete for the current Clerk user and redirects future onboarding attempts to `/main/homepage`.

Important files:

- `apps/web/app/page.tsx`
- `apps/web/app/auth/layout.tsx`
- `apps/web/app/auth/sign-in/[[...sign-in]]/page.tsx`
- `apps/web/app/auth/sign-up/[[...sign-up]]/page.tsx`
- `apps/web/proxy.ts`

### Onboarding

Implemented onboarding flow:

- `/onboarding/goals`
- `/onboarding/level`
- `/onboarding/assessment`
- `/onboarding/self-assessment`
- `/onboarding/preferences`
- `/onboarding/plan`

Onboarding is UI-first and stores state locally for now. It uses its own centered shell without dashboard sidebar navigation.

Important folders:

- `apps/web/app/onboarding/_components`
- `apps/web/app/onboarding/_data`
- `apps/web/app/onboarding/_types`
- `apps/web/app/onboarding/_utils`

### Dashboard Shell

The authenticated dashboard shell is in:

- `apps/web/app/main/layout.tsx`
- `apps/web/app/components/SideMenu.tsx`
- `apps/web/app/components/DashboardTopBar.tsx`

The sidebar currently supports:

- Home
- Practice Center
- Review Center
- Help
- About

The top bar supports:

- Back arrow based on the previous breadcrumb path.
- Section-aware breadcrumbs.
- Notification icon.
- Settings link.

Breadcrumb behavior currently implemented:

- Homepage and section landing pages hide breadcrumbs.
- Progress is treated as a homepage subpage: `Trang chủ > Tiến độ học tập`.
- Practice Center and Review Center keep scoped breadcrumb trails, so browser history from another section does not leak into the section trail.
- If a user enters a deep page from homepage, the breadcrumb can reflect that entry path, for example `Trang chủ > Flashcard` or `Trang chủ > Luyện Nói`.
- If a user enters Speaking from Practice Center, the breadcrumb stays scoped to Practice Center, for example `Trung tâm thực hành > Luyện Nói`.

### Homepage And Progress

Implemented:

- `/main/homepage`
- `/main/progress`

The progress page is considered a homepage subpage and the sidebar highlights Home while on `/main/progress`.

Important files:

- `apps/web/app/main/homepage/page.tsx`
- `apps/web/app/main/progress/page.tsx`

### Practice Center

Implemented route structure:

- `/main/practice-center`
- `/main/practice-center/reading`
- `/main/practice-center/listening`
- `/main/practice-center/writing`
- `/main/practice-center/speaking`
- `/main/practice-center/speaking/history`
- `/main/practice-center/speaking/history/[conversationId]`
- `/main/practice-center/[skill]/modules/[moduleId]`

Implemented UI:

- Practice Center hub with legacy skill card styling.
- Reading, Listening, and Writing module list pages.
- Shared module exercise runner for Reading, Listening, and Writing.
- Client-side answer selection and mock feedback display.
- Writing variant with text input/textarea behavior.
- Speaking chat page with mock conversation UI, lesson goals, vocabulary suggestions, recording/listening UI states.
- Speaking history list with grouped conversations, search, actions, and pagination UI.
- Transcript detail page with conversation bubbles, correction card, analysis scores, and Review Center CTA.

Important folders:

- `apps/web/app/main/practice-center/_components`
- `apps/web/app/main/practice-center/_data`
- `apps/web/app/main/practice-center/_types`
- `apps/web/app/main/practice-center/_utils`

Current note:

- The `Quay lại` button inside the module page is for previous question navigation, not app-level navigation.

### Review Center

Implemented route structure:

- `/main/review-center`
- `/main/review-center/flashcards`
- `/main/review-center/flashcards/[topicId]`
- `/main/review-center/flashcards/[topicId]/study`
- `/main/review-center/grammar`
- `/main/review-center/grammar/[categoryId]`
- `/main/review-center/grammar/[categoryId]/[lessonId]`

Implemented UI:

- Review Center hub with Flashcard and Grammar feature cards.
- Flashcard topic grid.
- Flashcard topic detail with learned/unlearned filters and sort label.
- Flashcard study page with flip state, previous/next controls, pronunciation button, fullscreen/menu icons, and options menu.
- Grammar overview grouped by category sections.
- Grammar category page with difficulty filter, lesson cards, progress, and CTA states.
- Grammar lesson page with theory blocks, examples, MCQ practice, and answer-check button.

Important folders:

- `apps/web/app/main/review-center/_components`
- `apps/web/app/main/review-center/_data`
- `apps/web/app/main/review-center/_types`
- `apps/web/app/main/review-center/_utils`

### Supporting Dashboard Pages

Implemented simple supporting pages:

- `/main/help`
- `/main/about`
- `/main/settings`

## Recent Updates

Recent frontend changes include:

- Implemented onboarding gating so onboarding appears only after the fresh sign-up redirect.
- Updated Clerk sign-up redirect to `/onboarding/goals?fresh_signup=1`.
- Updated Clerk sign-in redirect to `/main/homepage`.
- Added Clerk proxy matching for `/onboarding/:path*` so server `auth()` works on onboarding pages.
- Removed direct onboarding shortcut from auth header.
- Adjusted top-bar breadcrumb behavior to use scoped trails for Home, Practice Center, and Review Center.
- Adjusted top-bar back arrow to navigate to the previous breadcrumb path.
- Fixed lint error in `DashboardTopBar` by avoiding synchronous state update directly inside the effect body.
- Removed unused `UserButton` import from `AuthNav`.

Files currently modified relative to the existing git baseline:

- `apps/web/app/auth/layout.tsx`
- `apps/web/app/auth/sign-in/[[...sign-in]]/page.tsx`
- `apps/web/app/auth/sign-up/[[...sign-up]]/page.tsx`
- `apps/web/app/components/AuthNav.tsx`
- `apps/web/app/components/DashboardTopBar.tsx`
- `apps/web/app/onboarding/layout.tsx`
- `apps/web/proxy.ts`

## Data And Integration Boundary

Mock data remains the source of truth for UI rendering:

- Practice data: `apps/web/app/main/practice-center/_data`
- Speaking data: `apps/web/app/main/practice-center/_data/speaking-content.ts`
- Review data: `apps/web/app/main/review-center/_data/review-content.ts`
- Onboarding data: `apps/web/app/onboarding/_data/onboarding-content.ts`

Typed contracts exist under each feature area:

- `apps/web/app/main/practice-center/_types`
- `apps/web/app/main/review-center/_types`
- `apps/web/app/onboarding/_types`

Expected future integration points:

- Replace mock loaders with Gateway API calls.
- Persist onboarding profile and generated plan.
- Persist lesson progress, daily tasks, flashcard updates, grammar review items, and conversation transcripts.
- Connect AI grading, speaking feedback, speech recognition, text-to-speech, pronunciation scoring, and notification scheduling.

## Verification Status

Latest successful checks:

```bash
npm run lint --workspace @ai-agentic-english/web
npm run build --workspace @ai-agentic-english/web
```

Current known warnings:

- `apps/web/app/layout.tsx` has Next.js font warnings because custom fonts are loaded in the app layout.
- Next.js build warns about multiple lockfiles and inferred workspace root.

No current TypeScript or lint errors were present after the latest check.

## Suggested Next Steps

1. Run the dev server and manually verify the sign-up to onboarding redirect includes `fresh_signup=1`.
2. Test direct signed-out access to `/onboarding/goals` redirects to sign up.
3. Test direct signed-in access to `/onboarding/goals` redirects to `/main/homepage` when the session was not started by fresh sign-up.
3. Manually test breadcrumb entry cases:
   - Homepage to Flashcards.
   - Homepage to Speaking.
   - Practice Center to Speaking.
   - Review Center to Flashcard study.
4. Decide whether to keep current app-layout font loading or move fonts to the recommended Next.js pattern.
5. Begin backend integration by replacing mock loaders one feature area at a time.

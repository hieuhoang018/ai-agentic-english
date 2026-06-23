# Frontend ↔ Backend Integration Plan

Status: draft, 2026-06-22
Audience: backend dev (Hieu) and frontend dev, working together
Supersedes nothing — complements `docs/frontend-state.md` (UI shape) and
`docs/agents-integration-plan.md` (TS↔Python contract). Read those first if you haven't.

## 0. Why this doc exists

`apps/web` is fully built UI-wise but **zero pages call the backend** — every page renders from
hardcoded local data (`_data/*.ts`) or local component state. The backend (3 TS services + the
Python `agt_orchestrator`, all behind Kong at `localhost:8000`) is functionally done and
verified end-to-end via curl, but nothing on the frontend talks to it yet.

This plan wires them together, feature area by feature area, in an order that lets us prove the
hardest part (Clerk JWT → Kong → service) once, early, on the smallest possible surface, then
repeat the same pattern everywhere else.

## 1. What already exists (don't rebuild)

**Backend — exposed via Kong (`http://localhost:8000/api/...`), all JWT-protected unless noted:**

| Route | Method | Upstream | Request | Response |
|---|---|---|---|---|
| `/api/orchestrate/onboarding` | POST | agt-orchestrator | `{userId, currentLevel, dailyTimeBudgetMinutes, goals[]}` | `{id, userId, pathDefinition:{activities[]}, createdAt}` |
| `/api/orchestrate/grading` | POST | agt-orchestrator | `{exerciseId, attemptedAnswer, userId}` | `{exerciseId, correct, score, feedback}` |
| `/api/users` → `/me` | GET | user-service | — | `UserDto` incl. `settings` |
| `/api/users` → `/me/settings` | PATCH | user-service | partial `UserSettingsDto` | `UserSettingsDto` |
| `/api/modules` → `/`, `/:id`, `/:id/lessons` | GET | learning-materials-service | — | `ModuleDto[]` / `ModuleDto` / `LessonDto[]` |
| `/api/lessons/:id` | GET | learning-materials-service | — | `LessonDto` |
| `/api/exercises/:id` | GET | learning-materials-service | — | `ExerciseDto` (no answer key) |
| `/api/assessment/questions?skill=` | GET | learning-materials-service | — | `AssessmentQuestionDto[]` |
| `/api/assessment/score` | POST | learning-materials-service | `{answers:[{questionId,answer}]}` | scored result |
| `/api/learning-paths/:userId/active` | GET | learning-materials-service | — | `LearningPathDto` (404 if none) |
| `/api/health/*` | GET | each service | — | unauthenticated, for smoke checks |

DTO source of truth: `packages/shared/src/dto/user.ts`, `packages/shared/src/dto/learning-materials.ts`.

**Frontend — `apps/web/app/`, App Router, Next 16, React 19, Clerk:**

- Onboarding: `app/onboarding/{goals,level,assessment,self-assessment,preferences,plan}` — all
  local state, no submission anywhere (`_components/CompleteOnboardingLink.tsx` only sets a
  Clerk `unsafeMetadata` flag).
- Practice Center: `app/main/practice-center/**` — module/exercise runner reads from
  `_data/practice-content.ts`, answer-checking is local mock logic.
- Review Center: `app/main/review-center/**` — flashcards/grammar from `_data/review-content.ts`.
- Homepage/Progress/Settings: `app/main/{homepage,progress,settings}` — fully static.
- No API client exists anywhere (`grep` for `fetch`/`axios`/`NEXT_PUBLIC_API` returns nothing in
  `apps/web/app`).

**Auth mechanics that constrain everything below**: services don't verify JWTs themselves —
Kong's `jwt` plugin verifies the signature against Clerk's JWKS, then forwards the token; each
service's `requireAuth` just decodes `sub` and trusts it. So the frontend's only job is: get a
real Clerk session JWT client-side and attach it as `Authorization: Bearer <token>` on every
call. `useAuth().getToken()` (client components) or `auth().getToken()` (server components/route
handlers) from `@clerk/nextjs`.

## 2. Sequencing

Four stages. Each stage ends with something demoable end-to-end through the real Kong+services
stack (`docker compose up`), not just unit tests.

1. **Stage A — Plumbing** (joint, do this together first, ~half a day)
2. **Stage B — Onboarding** (smallest real slice, proves the whole chain)
3. **Stage C — Practice Center** (modules/lessons/exercises + grading)
4. **Stage D — Settings, Homepage/Progress, Review Center** (lower priority, can parallelize)

Don't start Stage C/D patterns until Stage B is verified working against live Docker — it's the
template every later stage copies.

---

## Stage A — Plumbing (joint)

Goal: one typed fetch wrapper, one env var, one Clerk-token helper. Everything else builds on
this so get it right once.

- [ ] **(Backend dev)** Confirm local Kong is reachable at `localhost:8000` with the current
  `docker-compose.yml`, and the Clerk dev instance (`elegant-anchovy-29.clerk.accounts.dev`)
  Kong is configured to trust matches the keys in `apps/web/.env`. (It does per this session's
  audit — just re-verify before frontend dev starts, in case `.env` rotated.)
- [ ] **(Frontend dev)** Add `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api` to
  `apps/web/.env.example` and `apps/web/.env`.
- [ ] **(Frontend dev)** Create `apps/web/lib/api/client.ts`: a small typed fetch wrapper.
  Shape:
  ```ts
  // apps/web/lib/api/client.ts
  type ApiError = { status: number; message: string; body?: unknown };

  async function apiFetch<TResponse>(
    path: string,
    opts: { method?: string; body?: unknown; token: string | null }
  ): Promise<TResponse> {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => undefined);
      throw { status: res.status, message: body?.message ?? res.statusText, body } satisfies ApiError;
    }
    if (res.status === 204) return undefined as TResponse;
    return res.json();
  }
  ```
  Two thin callers on top of this, so call sites never touch `fetch` directly:
  - `apps/web/lib/api/server.ts` — for Server Components/Route Handlers, gets the token via
    `auth().getToken()` from `@clerk/nextjs/server`.
  - `apps/web/lib/api/useApi.ts` (or similar client hook) — for Client Components, gets the
    token via `useAuth().getToken()`.
- [ ] **(Frontend dev)** Mirror the response DTOs you need from `packages/shared/src/dto/*` into
  `apps/web/lib/api/types.ts` (don't import `@ai-agentic-english/shared` directly into `apps/web`
  unless it's already a workspace dependency — check `apps/web/package.json` first; if it's not
  wired as a workspace dep, hand-copy the shapes you need rather than adding a new cross-cutting
  dependency without discussing it).
- [ ] **(Backend dev)** Skim each DTO file once with the frontend dev so naming/casing
  (camelCase throughout) and enum values (`CefrLevel`, `Skill`, `ExerciseType`) are unambiguous
  before they get hand-copied.
- [ ] **(Joint)** One smoke test: a throwaway client component calling
  `GET /api/users/me` and rendering the raw JSON, run against live `docker compose up`. If this
  401s, the JWT plumbing is wrong — fix it here before building anything on top.

Exit criterion: the smoke test renders real `UserDto` JSON in the browser, sourced from the live
Postgres `user-service` DB through Kong.

---

## Stage B — Onboarding (frontend-led, backend on call)

Goal: onboarding accumulates real answers across steps and calls
`POST /api/orchestrate/onboarding` at the end, replacing the hardcoded plan preview with the
real generated path.

- [ ] **(Frontend dev)** Add an onboarding-answers accumulator. `_types/onboarding.ts` already
  has `OnboardingProfile` (`goalId, assessmentMethod, levelScore, dailyMinutes,
  prioritySkills`) — use it. Simplest approach: a small context/provider in
  `app/onboarding/layout.tsx` (or `sessionStorage`, consistent with the existing
  `markOnboardingComplete` pattern in `CompleteOnboardingLink.tsx`) that each step page writes
  into as the user answers.
- [ ] **(Frontend dev)** Map `OnboardingProfile` → orchestrator request shape at submission time:
  `{ userId: <clerk user id>, currentLevel: <derived from levelScore/self-assessment>,
  dailyTimeBudgetMinutes: dailyMinutes, goals: [goalId, ...prioritySkills] }` — confirm the exact
  mapping with backend dev since `currentLevel` needs to land on a real `CefrLevel` enum value,
  not a raw score.
- [ ] **(Backend dev)** Confirm/clarify: does `currentLevel` need to be a CEFR string (`A1`..`C2`)
  exactly? What's the expected `goals` array — free strings or a fixed taxonomy matching
  `_data/onboarding-content.ts`'s goal IDs? Answer this before frontend dev codes the mapping,
  it'll save a round trip.
- [ ] **(Frontend dev)** Wire `app/onboarding/plan/page.tsx` (or wherever the "generate plan"
  step lives) to call the orchestrator on entry, show a loading state, and replace
  `GeneratedPlanPreview.tsx`'s hardcoded array with the real `pathDefinition.activities` from
  the response.
- [ ] **(Frontend dev)** Wire `CompleteOnboardingLink.tsx` to keep its existing Clerk-metadata
  completion flag (no change needed there) but only fire after the orchestrator call above has
  succeeded — don't let a user mark onboarding "complete" with no real plan if the call fails.
- [ ] **(Joint)** Decide error UX: what happens if `/api/orchestrate/onboarding` 502s (AGT-01/02
  unreachable)? Recommend: inline retry button, don't silently fall back to the old hardcoded
  preview (that would mask real outages).
- [ ] **(Joint)** Verify end-to-end against live `docker compose up`: full Sign up → goals →
  level → assessment → preferences → plan → see a real generated path → land on
  `/main/homepage`. Confirm the row lands in `learning-materials-service`'s `LearningPath` table
  and a `learning-path.ready` Kafka message is produced (backend dev can check via existing
  `docker compose logs` / a topic consumer — same as the Phase 6-TS manual verification).

Exit criterion: a fresh Clerk sign-up produces a real `LearningPath` row in Postgres, visible in
the UI, with no hardcoded plan content left in the onboarding flow.

---

## Stage C — Practice Center (frontend-led, backend on call)

Goal: module/lesson/exercise lists come from learning-materials-service, and submitting an
answer calls the real grading orchestrator route instead of local mock-feedback logic.

- [ ] **(Frontend dev)** Replace `practice-center/_data/practice-content.ts` module/lesson/
  exercise listings with `GET /api/modules`, `GET /api/modules/:id/lessons`,
  `GET /api/lessons/:id`, `GET /api/exercises/:id` calls. Suggest doing this as Server Components
  where the page is just a list/detail view (no client interactivity needed for fetching) —
  matches the existing App Router pattern in the rest of the app.
- [ ] **(Frontend dev)** Wire the exercise runner's answer-check action to
  `POST /api/orchestrate/grading` (`{exerciseId, attemptedAnswer, userId}`), replacing the local
  mock-feedback comparison. Use the real response's `{correct, score, feedback}` for the
  existing feedback UI states (already built — just needs real data piped in).
- [ ] **(Backend dev)** Heads-up to frontend dev: grading is currently a **naive case-insensitive
  string match** (see Known Issues in `CLAUDE.local.md`) — no normalization for
  punctuation/whitespace, and only `mcq`/`sentence-correction` types are seeded today. Don't
  build frontend UX (e.g. partial-credit displays) that assumes richer grading than this; flag
  to backend dev if a practice-center exercise type doesn't match what's seeded.
- [ ] **(Joint)** Speaking pages (`practice-center/speaking/**`) are explicitly **out of scope**
  for this stage — they depend on the real-time WebSocket/AGT-03 path which is still blocked on
  TTS (see Known Issues). Leave speaking on its current mock UI; don't attempt to wire it.
- [ ] **(Joint)** Verify against live Docker: pick one seeded module/lesson/exercise, complete it
  end-to-end in the browser, confirm a real grading response renders, and confirm an
  `attempt.recorded` Kafka message is produced (currently orphaned — no consumer — that's a known
  gap, not something to fix in this stage, just confirm it's still being emitted as expected).

Exit criterion: at least one full module's lesson/exercise list and grading flow in
Practice Center is sourced entirely from the backend, with zero references to
`practice-content.ts` for that module.

---

## Stage D — Settings, Homepage/Progress, Review Center (can parallelize, lower priority)

These don't block anything else; pick them up after B and C are solid, or split across both devs
in parallel once the Stage A plumbing pattern is proven.

- [ ] **(Frontend dev)** `app/main/settings/page.tsx`: wire to `GET /api/users/me` (load) and
  `PATCH /api/users/me/settings` (save) — direct, no backend changes needed.
- [ ] **(Frontend dev)** `app/main/homepage/page.tsx` / `app/main/progress/page.tsx`: wire to
  `GET /api/learning-paths/:userId/active` for "today's plan" / progress summary content. Note
  there is **no dedicated progress-percentage endpoint** today (Memory & Progress Service was
  deleted in the architecture split) — `LearningPathDto.pathDefinition` only gives the path
  shape, not completion state. **(Backend dev)** flag if/when a real progress-tracking endpoint
  is needed here; out of scope to build new backend surface as part of this plan without
  agreeing scope first.
- [ ] **(Joint)** Review Center (flashcards/grammar): **no backend exists for this at all** —
  no vocab/grammar/SRS service survived the architecture split for review-center content beyond
  AGT-07's reminder-context endpoint (which is internal-only, not exposed via Kong, and only
  returns reminder summaries, not full review-center content). Treat this as out of scope for
  this integration pass; flag separately if/when backend work is scoped for it. Leave
  `review-content.ts` mock data in place.

Exit criterion: Settings reads/writes real user settings; homepage/progress shows a real active
plan; Review Center is explicitly left on mock data with the gap documented (not silently
ignored).

---

## 3. Open questions to resolve before/during Stage B

These need a quick sync between backend dev and frontend dev, not solo guessing:

1. Exact `currentLevel` and `goals` value mapping from onboarding UI choices to the orchestrator
   request shape (see Stage B). (Map the level on the scale from 0 to 10 to the corresponding CEFR level, 0 = A1, 1-2 = A2, 3-4 = B1, 5-6 = B2, 7-8 = C1, 9-10 = C2; use goalid in the frontend)
2. Error/loading UX convention across the whole app for backend calls (toast? inline banner?
   retry button?) — pick one pattern in Stage A's smoke test and reuse it everywhere rather than
   inventing a new one per page. (Use toast wherever possible)
3. Whether `apps/web` should add `@ai-agentic-english/shared` as a real workspace dependency (to
   import DTOs directly) instead of hand-copying types — worth a 5-minute discussion since it
   changes how Stage A's `types.ts` gets built and how future DTO changes propagate. (Yes)

## 4. Explicit non-goals for this pass

- Real-time speaking (Phase 6/AGT-03) — blocked on TTS, not touched here.
- Review Center backend — no service exists, flagged not built.
- Progress/completion-percentage tracking — no endpoint exists, flagged not built.
- Notification-service has no public routes beyond `/health` — nothing to wire on the frontend
  for notifications yet.

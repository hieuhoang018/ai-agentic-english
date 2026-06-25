# Test Plan: AI Agentic English

## 1. Introduction & Objectives

This plan defines the test strategy for the application **assuming all designed functionality
is implemented** (per `README.md`'s product spec and `docs/implementation-plan.md`). Rather
than organizing by service/repo boundary, it is organized by **user-facing feature phase** —
each phase is a coherent slice of the product a learner experiences, and its test section
covers every component that phase touches (frontend, Kong, TS services, Python agents,
infra), regardless of which team owns which piece.

Where the *current* implementation has known gaps relative to the full design (tracked in
`CLAUDE.local.md`'s "Known issues" section), each phase calls these out explicitly as
**Known gaps** rather than writing tests against functionality that doesn't exist yet. This
keeps the plan usable today (skip/mark-pending the gapped cases) while remaining the target
spec once those gaps close.

## 2. Scope

**In scope:** functional correctness of each phase's end-to-end flows; contract correctness at
every boundary a flow crosses (Kong routing/JWT, `/internal/*` service-to-service auth, agent
LLM-router fallback behavior, Kafka producer/consumer pairs); relevant non-functional concerns
(performance, security, resilience) called out per phase where that phase has a meaningful
non-functional risk, rather than a separate generic non-functional section.

**Out of scope:** load/capacity planning at production scale (no production traffic model
exists yet); RBAC testing beyond "valid JWT required, no JWT = rejected" (the system has no
RBAC by design); third-party infra correctness itself (Kong, Kafka, Postgres, Novu) — tested
only at the integration points this app builds on top of them.

## 3. Test Levels (legend used throughout)

| Level | Meaning |
|---|---|
| **Unit** | Single function/module, no network/DB, in-process |
| **Integration** | Component + its real dependency (real Postgres via Prisma, real Redis, real LLM-router mock) |
| **Contract/API** | Request/response shape and auth at a service boundary (Kong route, `/internal/*` secret, agent↔service HTTP) |
| **E2E** | Full flow through Kong across multiple services/agents/frontend, real infra (docker-compose) |
| **Security** | Auth/authz boundary, injection, secret handling |
| **Resilience** | Failure-mode behavior (broker restart, LLM tier fallback, downstream timeout) |
| **Performance** | Latency/throughput under realistic load for that flow |
| **Manual/Exploratory** | Unscripted, judgment-based (esp. AI-generated content quality, conversational UX) |

## 4. Test Environment Strategy

- **Primary environment**: `infra/docker-compose.yml` brought up locally/in CI — real Postgres
  per service, real Kafka (KRaft), real Redis, real MinIO, real Kong with declarative config.
  Integration and E2E tests run against this, not mocks, wherever the thing under test is
  this app's own code talking to real infra.
- **LLM mocking**: agents' 3-tier router (`agents/shared/llm/router.py`, Groq → OpenRouter →
  Ollama) is mocked with deterministic fixture responses for functional/contract/E2E tests —
  real-model nondeterminism and cost make it unsuitable for the bulk of the suite. A small,
  separately-tagged **live LLM smoke suite** (manual or scheduled, not part of CI gating) calls
  real models to catch drift (e.g. the `deepseek-chat-v3.1:free` retirement class of issue) and
  judge actual content quality.
- **Seed/fixture data**: vocab/grammar/passage/assessment seed JSONL fixtures act as the content
  baseline for tests that need realistic catalog data (currently blocked from reaching teammates
  by the `.gitignore` issue tracked in `CLAUDE.local.md` — test infra should not depend on that
  being fixed, so a minimal committed test-only fixture set is used in CI regardless).
- **Kafka**: tested against the real broker, not mocked — dedup logic (`ProcessedEvent`,
  `ScheduledReminderRun`) and consumer-group semantics are part of what's under test.
- **Test data isolation**: each service/agent test run uses its own ephemeral DB (migrate →
  test → drop), never a shared persistent dev DB.

## 5. Phase Section Template

Each phase section below follows the same shape:

1. **Overview & user story** — what the learner experiences
2. **Components & data flow** — sequence of calls across Kong/services/agents/infra
3. **Preconditions / test data** — what must exist before tests run
4. **Functional test cases** — happy path, edge cases, error cases, grouped by test level
5. **Cross-boundary contract checks** — specific request/response/auth assertions at each hop
6. **Non-functional considerations** — only where this phase has a real risk worth calling out
7. **Known gaps** — current-implementation caveats, cross-referenced to `CLAUDE.local.md`
8. **Exit criteria** — what "this phase is adequately tested" means

## 6. Phase Index

| # | Phase | Status |
|---|---|---|
| 7 | Onboarding & Assessment | ✅ Drafted |
| 8 | Exercises & Learning Path Delivery | ✅ Drafted |
| 9 | Review Center (SRS / Memory) | ✅ Drafted |
| 10 | AI Conversation / Speaking Tutor | ✅ Drafted |
| 11 | Progress Analysis & Recommendations | ✅ Drafted |
| 12 | Habit-Building & Notifications | ✅ Drafted |
| 13 | Translation | ✅ Drafted |
| 14 | Cross-cutting / Platform | ✅ Drafted |
| 15 | Cross-Phase Findings Summary | ✅ Drafted |

## 7. Phase: Onboarding & Assessment

### 7.1 Overview & user story

A new learner signs up (Clerk), states their current level/goals/daily time budget, optionally
takes a placement assessment, and receives a generated learning path that the rest of the app
(Phase 8) executes day to day.

### 7.2 Components & data flow

**Important finding**: the codebase currently has **two parallel, unconnected onboarding-time
flows**, plus a third assessment mechanism that may be superseded. Each must be tested as its
own entry point until/unless they're unified:

**Flow A — Profile + plan generation (the one Kong actually exposes today)**
```
PWA → Kong (JWT) → POST /api/orchestrate/onboarding
  → agt-orchestrator
      → POST AGT-01 /profile/{clerk_user_id}        (create/init profile, goal_profile)
      → POST AGT-02 /plans/{clerk_user_id}/generate  (skill_estimates, daily_minutes, goals)
  → emits Kafka `learning-path.ready` {userId, pathId}
  ← 201 {id, userId, pathDefinition.activities[], createdAt}
```
AGT-02 internally fetches the AGT-01 profile, optionally merges `skill_estimates` into
`irt_theta`, writes a new versioned `agent_learning_plans` row (deactivating any prior active
plan), and calls Learning Materials' catalog to build real activities.

**Flow B — Static placement-test scoring (exists, not wired into Flow A)**
```
PWA → Kong (JWT) → GET  /api/assessment/questions   (Learning Materials Service)
PWA → Kong (JWT) → POST /api/assessment/score        {answers:[{questionId,answer}]}
  → scoreAssessment(): per-skill sequential CEFR gating, 0.6 threshold, stops at first failed level
  ← {levels: {reading?, writing?, listening?: CefrLevel}}   (no `speaking` — deliberately unscored)
```
Per `CLAUDE.local.md`'s Known issues, this result is **not currently forwarded** into Flow A's
`skill_estimates` — that handshake (field name TBD with the AI engineer) is unimplemented.

**Flow C — AGT-05 adaptive (CAT/IRT) assessment (exists, no Kong route, not called by anything)**
```
(no public route found in gateway/kong/kong.yml)
POST AGT-05 /assessments/start    {clerk_user_id, skill_domain} → first item at theta=0.0
POST AGT-05 /assessments/respond  {assessment_id, item_id, correct, prior_responses, ...}
  ← next item OR termination result
GET  Learning Materials /internal/assessment/item-bank?skill=...  (no auth — IRT difficulty params)
```
AGT-05's own code marks Fisher-information item selection and SE(theta)<0.3 termination as
`TODO Phase 8+` — this flow is incomplete even on its own terms.

### 7.3 Preconditions / test data

- A1–B2 assessment question bank seeded (36 questions: 4 levels × 3 skills × 3 questions,
  `assessment_seed.jsonl` / `npm run seed:assessment`), including the 12 listening questions with
  embedded `audioKey` in `prompt`.
- A Clerk-issued test JWT (or Kong JWT plugin test keypair) for an authenticated user with no
  prior profile/plan/attempt history (fresh-user case) and one with existing history (re-onboarding
  / replan case).
- AGT-01/AGT-02 Postgres schemas migrated; LLM router mocked with a fixture plan-generation
  response for AGT-02's catalog-grounded plan synthesis.
- A non-existent `userId` and a malformed JWT, for negative-path tests.

### 7.4 Functional test cases

**AGT-01 Profiling — Integration**
- Create profile for a brand-new `clerk_user_id` → 201, profile persisted with supplied
  `goal_profile`.
- Re-create (`POST /profile/{id}`) for an existing user is idempotent — no duplicate row, fields
  re-initialized as documented ("Create or re-initialise... Idempotent").
- `PATCH /profile/{id}` with partial fields updates only those fields; empty body → 400
  (`"No fields to update"`).
- `GET /profile/{id}?session_id=...` returns base LTM profile merged with in-session error
  deltas; without `session_id`, returns base profile only — verify the two responses actually
  differ when a session delta exists.
- `GET /profile/{id}` for a profile that was never created → expected 404 (verify; not shown in
  the excerpt reviewed — confirm actual behavior, don't assume).

**Learning Materials Assessment (Flow B) — Integration + Contract**
- `GET /api/assessment/questions` (no `skill` filter) → all 36 questions, correct DTO shape
  (`toAssessmentQuestionDto`), answer keys **not** leaked in the DTO.
- `GET /api/assessment/questions?skill=listening` → only listening questions, each with a
  resolvable `audioKey` inside `prompt`.
- `POST /api/assessment/score` — per-skill sequential gating correctness (this has a regression
  test already per `CLAUDE.local.md`; this phase's test plan should add black-box cases against
  the live route, not just the unit-tested function):
  - All-correct at every level for a skill → highest seeded level (B2) returned for that skill.
  - Fails A2 but would have passed B1 if scored independently → sequential gating means the
    skill's level stops at A1 (or undefined if A1 also fails) — this is the exact behavior the
    2026-06-24 fix targeted; assert the *non-naive* result, not a "highest passing level overall"
    result.
  - Mixed-skill submission (reading passes B1, writing passes only A1, listening submits nothing)
    → independent per-skill levels, `listening` key absent or null if zero answered.
  - `answers` not an array → 400 `ValidationError`.
  - `questionId` referencing a non-existent question → silently ignored (not counted), verify
    this is intentional and doesn't crash.
  - No `speaking` key ever appears in the response (confirms the 2026-06-24 "speaking not
    assessed" decision holds at the API level, not just in seed data).
- `GET /internal/assessment/item-bank` (or wherever it actually lives — confirm path) has **no
  auth** by design (comment: "Service-to-service... no auth, IRT format") — verify it is *not*
  reachable through Kong (only via the docker-compose internal network), since an unauthenticated
  internal endpoint exposed publicly would be a real vulnerability.

**AGT-02 Learning Path — Integration**
- `POST /plans/{id}/generate` with no prior plan → creates `version: 1`, `is_active: true`.
- Calling `generate` again for the same user → previous active plan is deactivated, new plan is
  `version: 2`; `GET /plans/{id}/active` returns only the new one.
- `skill_estimates` supplied → merged into the fetched profile's `irt_theta` before plan
  synthesis (verify the merge, not just that the call succeeds).
- `GET /plans/{id}/today` with no active plan → `{plan_id: null, activities: [], daily_minutes: 0}`
  (graceful empty state, not an error).
- `POST /plans/{id}/replan` produces a new version distinct from `generate` (confirm whether
  there's any actual behavioral difference today, or if it's currently an alias — flag if the
  latter).
- `daily_minutes` aggregation in `today` equals the sum of `estimated_minutes` across returned
  activities (catches a drift bug if the catalog-fix changes activity shape again).

**Orchestrator Flow A — E2E**
- Happy path: `POST /api/orchestrate/onboarding` with a fresh user → 201, `pathDefinition.
  activities` non-empty, activities reference real Learning Materials catalog titles/levels (this
  is what the catalog-path fix `c859211` was for — assert real content, not placeholder strings).
- AGT-01 unreachable (simulate via network partition or stopped container) → orchestrator returns
  502 `"AGT-01 profile creation failed"`, and **AGT-02 is never called** (no partial side effect).
- AGT-01 succeeds, AGT-02 unreachable → 502 `"AGT-02 plan generation failed"`; verify the AGT-01
  profile created in this partial-failure case is still in a sane state for a retry (no orphaned
  half-initialized profile that blocks a subsequent successful retry).
- On success, Kafka `learning-path.ready` is published with the correct `userId`/`pathId`, and
  Notification Service's existing consumer (Phase 12) picks it up — cross-phase contract check,
  worth one shared test rather than duplicating in both phases.
- Kafka publish failure (simulate broker down) → response is still 201 (the emit is
  fire-and-forget, wrapped in try/except per the code) — confirm this is the intended trade-off
  (user-facing success even if the downstream notification never fires) and not a silent data-loss
  bug worth raising.

### 7.5 Cross-boundary contract checks

- Kong JWT plugin rejects requests with no/expired/malformed JWT on every `/api/orchestrate/*`
  and `/api/assessment/*` route — 401 before the request ever reaches the upstream service (test
  at the Kong layer, not just service-level `requireAuth`).
- `agt-orchestrator` → Learning Materials internal calls (grading flow, Phase 8) carry
  `x-internal-secret`; Learning Materials' assessment `/item-bank` route deliberately has none —
  confirm this asymmetry is enforced by network topology (not Kong-routed) rather than by an
  application-layer check, since there's no code-level guard visible.
- `agt-orchestrator`'s `OnboardingRequest`/`GradingRequest` Pydantic models vs. whatever
  `apps/web` actually sends — per Known issues, the frontend isn't calling these endpoints yet, so
  this is a **forward-looking contract test** (schema validation only) until the frontend lands.

### 7.6 Non-functional considerations

- **Security**: the unauthenticated `/item-bank` endpoint (Flow C) — confirm no Kong route
  exists for it anywhere in `gateway/kong/kong.yml` today, and add a regression test/lint rule if
  one is ever added without auth.
- **Resilience**: orchestrator's two sequential HTTP calls (AGT-01 then AGT-02) with no saga/
  compensation logic — partial-failure behavior above is the main resilience risk in this phase.
- **Performance**: not a priority for onboarding (one-time, low-frequency flow) — skip dedicated
  load testing here.

### 7.7 Known gaps

- Flow A and Flow B are not connected — assessment results never reach plan generation. Test
  Flow B in isolation; don't write an "assessment improves the generated plan" E2E test until the
  handshake (`CLAUDE.local.md` Known issues) is built.
- Flow C (AGT-05 CAT) has no Kong route and isn't called by the orchestrator or (as far as
  confirmed) anything else — confirm with the AI engineer whether it's still the intended design
  or dead code superseded by Flow B's static form before investing further test effort in it
  beyond basic integration coverage of what exists.
- `apps/web` doesn't call `/api/orchestrate/onboarding` yet — no real frontend E2E (Cypress/
  Playwright through the actual UI) is possible for this phase until that wiring lands; until
  then, E2E coverage here means API-level E2E (Kong → services → agents), not browser-level.
- AGT-02 plan activities still don't carry real `moduleId`/`lessonId`/`exerciseId` (per Known
  issues) — Phase 8 tests that need to resolve a plan activity to a gradable exercise should not
  assume this works yet.

### 7.8 Exit criteria

Flow A and Flow B each have integration coverage of every listed case (happy path + every
documented edge/error case) green against real docker-compose infra with mocked LLM responses;
the Flow A↔Notification Kafka contract test passes; Flow C has at minimum smoke-level coverage
(start/respond don't crash) with its production status flagged to the team rather than silently
assumed-dead.

## 8. Phase: Exercises & Learning Path Delivery

### 8.1 Overview & user story

A learner opens today's plan, browses the module/lesson/exercise catalog, attempts an exercise,
and gets graded — with progress advancing to the next item in their path on a correct attempt.

### 8.2 Components & data flow

```
PWA → Kong (JWT) → GET /api/learning-materials/modules            (Learning Materials, public)
PWA → Kong (JWT) → GET /api/learning-materials/modules/:id/lessons
PWA → Kong (JWT) → GET /api/learning-materials/lessons/:id
PWA → Kong (JWT) → GET /api/learning-materials/exercises/:id       (no answerKey in response)
AGT-02            → GET /internal/catalog/summary, /internal/vocab, /internal/grammar,
                     /internal/passages                            (no auth on /internal/*,
                     network-isolated — used during plan generation, Phase 7)
PWA → Kong (JWT) → POST /api/orchestrate/grading {exerciseId, attemptedAnswer, userId}
  → agt-orchestrator
      → GET LM /internal/exercises/:id  (x-internal-secret) → answerKey
      → naive case-insensitive string compare → {correct, score, feedback}
      → emits Kafka `attempt.recorded` {exerciseId, userId, correct, score}  [orphaned topic,
        no consumer — see Known gaps]
```
Note: **no code path here advances `Progress.currentModuleId/LessonId/ExerciseId`** —
`pathProgression.ts`/`getNextPosition` was Phase-4-era logic that lived in the now-deleted
Memory & Progress Service. Confirm during testing whether anything in the current `agents/`
stack (e.g. AGT-06 memory, AGT-09 recommendation) has reimplemented progress advancement, or
whether a learner's plan never actually moves forward after a correct attempt today.

### 8.3 Preconditions / test data

- Seeded catalog: 6 modules / 19 lessons / 73 exercises across the 3 hand-written + 3
  LLM-generated modules (`mod-gen-reading-a2`, `mod-gen-listening-a2`, `mod-gen-writing-b1`),
  each exercise type (`mcq`, `fill-blank`, `sentence-correction`, `listening-comprehension`)
  represented.
- At least one `listening-comprehension` exercise whose `audioKey` is verified to resolve to a
  real object in the `passage-audio` MinIO bucket (per the per-machine MinIO known-gap, this must
  be freshly seeded via the ETL on whichever machine runs the test, not assumed pre-populated).
- A valid `exerciseId` and a non-existent one; an authenticated `userId` and grading payloads for
  each exercise type with both a correct and an incorrect `attemptedAnswer`.

### 8.4 Functional test cases

**Catalog browsing — Integration + Contract**
- `GET /modules` → all modules, ordered by `order`; each item matches `toModuleDto` shape (no
  internal-only fields leaked).
- `GET /modules/:id/lessons` for a real module → lessons ordered correctly; for a non-existent
  module → 404 `NotFoundError` (verify the lookup happens before the lessons query, not an empty
  array masquerading as "module exists but has no lessons").
- `GET /lessons/:id` valid/invalid id → 200/404.
- `GET /exercises/:id` → **`answerKey` must never appear in this response** — this is the
  single most important assertion in this phase; a regression here is a content-leak bug, not
  just a UX bug. Test all 4 exercise types, not just one.
- All four catalog/module/lesson/exercise routes reject requests with no JWT (401 at Kong).

**Grading — E2E (Orchestrator + Learning Materials)**
- `mcq` exercise, correct answer (exact match) → `{correct: true, score: 1.0}`.
- `mcq` exercise, correct answer but different case/whitespace (e.g. `" A "` vs `"a"`) →
  **currently passes** because the orchestrator lowercases+trims both sides — verify this is
  true for `mcq` but examine whether it produces false negatives for the other 3 types where the
  old deterministic grading module used to do type-specific normalization (e.g. punctuation
  stripping for `sentence-correction`, which a case/whitespace-only compare won't catch). This is
  the exact gap flagged in `CLAUDE.local.md` — write tests that **demonstrate** the gap (e.g. a
  `sentence-correction` answer that's semantically/punctuation-equivalent but fails the naive
  compare) rather than only confirming the happy path.
- `listening-comprehension` exercise, correct transcript-based answer → graded correctly; confirm
  grading itself doesn't require fetching the audio (answer key is text, audio is incidental).
- Incorrect answer → `{correct: false, score: 0.0, feedback: "Incorrect. The correct answer is: ..."}`
  — verify the correct answer is only ever revealed post-attempt, never pre-attempt (no leak via
  any other route).
- `exerciseId` not found → orchestrator returns 404 "Exercise not found" (propagated from LMS's
  404).
- Learning Materials Service unreachable → orchestrator returns 502 "LMS service unreachable".
- Grading succeeds even if Kafka publish of `attempt.recorded` fails (fire-and-forget, same
  pattern as Phase 7's `learning-path.ready`) — confirm grading response still reaches the user.
- Repeat-attempt case: grading the same exercise twice for the same user — confirm there's no
  idempotency/duplicate-prevention logic (there appears to be none) and decide whether that's
  acceptable for this phase or worth flagging (e.g. can a user farm `attempt.recorded` events by
  resubmitting the same correct answer repeatedly?).

**Progress advancement — investigate before testing**
- Before writing any test here: confirm whether progress advancement exists anywhere in the
  current `agents/` stack. If not, this is a **functional gap**, not just a missing test — flag
  to the team rather than writing tests against logic that was deleted with Memory & Progress
  Service and never rebuilt. (See Known gaps.)

### 8.5 Cross-boundary contract checks

- `agt-orchestrator` → Learning Materials `/internal/exercises/:id` carries `x-internal-secret`
  matching `INTERNAL_SECRET`; a request with a missing/wrong secret → confirm LMS's `/internal/*`
  middleware actually rejects it (this guard should exist per the architecture doc's `/internal/*`
  convention — verify it's enforced in code, not just convention).
- `/internal/*` routes are unreachable from outside the docker-compose network — attempt a direct
  call from outside (host machine hitting the service's exposed port directly, bypassing Kong) to
  confirm whether `/internal/*` is *only* protected by the shared secret (reachable, secret
  required) or also by network segmentation. This matters for the security assessment in 8.6.

### 8.6 Non-functional considerations

- **Security**: answerKey-leak regression tests (8.4) are the top priority in this phase. Also
  verify the `/internal/*` secret isn't logged anywhere in plaintext (orchestrator/service logs).
- **Resilience**: grading's Kafka fire-and-forget pattern — confirm a broker outage degrades
  gracefully (grading still works, just no event) rather than blocking/erroring the user-facing
  response.
- **Performance**: grading is on the user's synchronous critical path (per the architecture's
  sync-vs-async discipline) — worth a basic latency check (e.g. p95 under a modest concurrent
  load) since every exercise submission goes through 2 sequential network hops
  (orchestrator→LMS) plus a Kafka publish.

### 8.7 Known gaps

- **Naive grading** has no per-type normalization — see 8.4, this is a real correctness gap for
  `fill-blank`/`sentence-correction`/`listening-comprehension`, not just `mcq`.
- **`attempt.recorded` is orphaned** — no consumer exists anywhere; tests should confirm the
  *publish* succeeds but should not assert on any downstream consumption (there is none to
  assert on) — except for whatever real consumer exists for the *old* event name from Phase 5's
  Memory & Progress Service, which is now deleted, so even that's gone.
- **Progress advancement is an open question** — likely missing entirely post-Phase-6-TS cutover;
  confirm with the team before this phase's plan is considered complete, since "does the learner
  actually move forward" is core to this phase's user story.
- **`apps/web` integration unconfirmed** — same caveat as Phase 7; API-level E2E only until the
  frontend is verified to call these routes.

### 8.8 Exit criteria

Catalog routes have full contract coverage including the answerKey-leak negative tests; grading
has coverage for all 4 exercise types' happy/error paths plus an explicit, documented test (not
just a TODO comment) demonstrating the naive-grading false-negative gap; the progress-advancement
question is resolved (either real tests exist, or the team has confirmed and accepted the gap)
before this phase is marked done — not left ambiguous.

## 9. Phase: Review Center (SRS / Memory)

### 9.1 Phase-level blocker — no public route exists

`gateway/kong/kong.yml` has **zero routes** for AGT-06 (Memory & Knowledge) or AGT-07 (Review
Generation) — confirmed by grep, not assumption. The only externally-reachable touchpoint today
is AGT-07's `/internal/reminders/{userId}/context`, called server-to-server by Notification
Service (Phase 12), gated by `x-internal-secret`. There is currently **no way for the PWA to
fetch due review items, rate a review, or pull a daily test** — the "Review Center" feature as a
learner-facing surface does not exist at the API layer yet, even though the underlying AGT-06/
AGT-07 logic does. Treat this phase's tests as agent-level integration tests today (calling
AGT-06/AGT-07 directly, bypassing Kong, as a developer/CI would) — not as Kong/E2E tests — until
public routes are added.

### 9.2 Components & data flow

```
AGT-04 (feedback, Phase 10) → POST AGT-06 /sessions/{id}/errors        (dual-write during a
                                                                          conversation/exercise)
AGT-01 (Phase 7)             → GET  AGT-06 /sessions/{id}/errors        (intra-session merge)
(anything emitting STM)      → POST AGT-06 /sessions/{id}/{context,vocab,difficulty,lang,writing}
(end of session)             → POST AGT-06 /sessions/{id}/consolidate   (idempotent STM→LTM)
AGT-07                       → GET  AGT-06 /ltm/{userId}/vocabulary     (for vocab-of-the-day,
                                                                          and presumably due-item
                                                                          scheduling)
AGT-10 (Phase 12)            → GET  AGT-07 /schedule/{userId}/due   (exercise_library.py, feeds
                                                                       habit-building's "Due for
                                                                       Review" activity source)
(no caller found in repo)    → POST AGT-07 /schedule/{userId}/rate
(no caller found in repo)    → GET  AGT-07 /tests/{userId}/daily
Notification Service         → GET  AGT-07 /internal/reminders/{userId}/context  (x-internal-secret)
```
`rate`/`tests/daily` have no confirmed caller anywhere in the repo (verified by grep) — agent-
internal-only today, awaiting frontend wiring same as Phase 7/8's orchestrator routes. `due` *is*
consumed, but only by another agent (AGT-10), not by anything user-facing — so the "no Review
Center UI surface" conclusion in 9.1 still holds.

### 9.3 Preconditions / test data

- A test session with a populated STM (errors, context turns, vocab encounters) ready for
  consolidation.
- A `clerk_user_id` with consolidated LTM vocabulary spanning a range of `encounter_count` values
  (to exercise vocab-of-the-day's "least-familiar" selection) and a mix of due/not-due SRS items
  for `/schedule/due`.
- AGT-06's Postgres + Redis (STM is presumably Redis-backed given the session-scoped, ephemeral
  nature — confirm) migrated/flushed between test runs to avoid cross-test STM bleed.

### 9.4 Functional test cases

**STM lifecycle — Integration**
- Append error/context/vocab/difficulty/lang/writing for a session, then GET each back — round-
  trip correctness per state type.
- GET on a session with no `difficulty`/`lang`/`writing` state set → 404 (per the code, these
  three explicitly 404 on missing state; `errors`/`context`/`vocab` GETs return empty
  collections instead — verify this asymmetry is intentional, not an oversight, since a learner
  with no errors yet shouldn't 404).
- `set_state`/`get_state` (generic STM state, distinct from the typed setters above) round-trips
  correctly; missing state → 404 with `"Session state not found"`.

**Consolidation — Integration**
- First `POST /sessions/{id}/consolidate` for a session → `{consolidated: true}`, STM data has
  moved into LTM (`/ltm/{userId}/vocabulary`, `/errors`, `/sessions` reflect it).
- Second consolidate call for the *same* session → `{consolidated: false}` — idempotency is the
  core contract here; test this explicitly, not just the first-call happy path.
- Consolidate with `skill_focus` affecting which STM categories get merged — if the param has
  any branching behavior, cover at least one case where it changes the outcome.

**LTM reads — Integration**
- `/ltm/{userId}/vocabulary?limit=N` respects the limit; default limit (200 per code) applied
  when omitted.
- `/ltm/{userId}/errors?skill_domain=X` filters correctly; omitted filter returns all skills.
- A user with no LTM data yet (never consolidated) → empty arrays, not errors, on every `/ltm/*`
  read.

**AGT-07 Review Scheduling — Integration**
- `/schedule/{userId}/due` ordering is "retrievability ascending" — construct a fixture with
  items at known retrievability values and assert the returned order, not just that it returns
  *something*.
- `/schedule/{userId}/rate` with `quality` 0–5 updates SM-2 state — given the code's own
  `TODO Phase 8+: full SM-2 stability/retrievability update` comment, **first confirm what the
  current partial implementation actually does** (read `agt07_review/service.py::rate_item`)
  before writing assertions — don't assume full SM-2 semantics are implemented. Test the
  *current* behavior, and separately log a coverage note for the TODO'd full algorithm once
  built.
- `quality` outside 0–5 → verify whether there's input validation (Pydantic doesn't enforce a
  range here just from the type `int`) — if none exists, this is a gap worth a negative test
  demonstrating it, similar to the grading-normalization gap in Phase 8.
- `/tests/{userId}/daily?size=N` returns at most `N` items; per the `TODO Phase 8+: 40/30/20/10
  composition` comment, confirm current composition logic (likely simpler/uniform) and test
  *that*, not the not-yet-built weighted version.
- `/internal/reminders/{userId}/context`: correct `x-internal-secret` → 200 with
  `dueReviewCount`/`vocabOfTheDay`; wrong/missing secret → 403. `vocabOfTheDay.meaning` is
  **always `""`** (hardcoded, per `CLAUDE.local.md` Known issues) — assert this explicitly so the
  test suite documents the gap and turns green again automatically the day someone fixes it.
- Vocab-of-the-day with zero LTM vocabulary for the user → `vocabOfTheDay: null` (per
  `_pick_vocab_of_the_day` returning `None`), not an error.
- AGT-06 unreachable when AGT-07 calls it for vocab-of-the-day → caught exception, logged
  warning, `vocabOfTheDay: null` — resilience case, not a crash.

### 9.5 Cross-boundary contract checks

- `/internal/reminders/...`'s secret check (`x_internal_secret != settings.INTERNAL_SECRET`) —
  confirm `settings.INTERNAL_SECRET` is sourced consistently with every other service's
  `x-internal-secret` value (same env var name/value across the compose network); a mismatch here
  would silently break Phase 12's reminder flow with a 403 that's easy to misattribute.
- No Kong route exists for `/schedule/*`, `/tests/*`, `/sessions/*`, `/ltm/*` — confirm none of
  these are accidentally reachable through some other route's path prefix overlap.
- `/schedule/{userId}/due`'s response shape must match what AGT-10's `exercise_library.py`
  expects to consume — this contract is exercised for real in Phase 12; one shared test here
  (or there) is enough, don't duplicate.

### 9.6 Non-functional considerations

- **Security**: same `/internal/*`-style secret check pattern as Phase 8 — verify constant-time
  comparison isn't a concern here (low-value internal secret, low risk, but note if a timing
  side-channel were ever relevant elsewhere).
- **Resilience**: AGT-07→AGT-06 dependency (vocab-of-the-day) is the only cross-agent runtime
  dependency in this phase — already covered above.

### 9.7 Known gaps

- **No public route for the Review Center feature at all** — this is the headline gap for this
  phase; everything else is secondary until this is addressed.
- **SM-2 implementation is partial** (`TODO Phase 8+` on both stability/retrievability update and
  daily-test composition) — test current behavior, don't assume spec compliance.
- **`vocabOfTheDay.meaning` is permanently empty** — known, tracked.
- **`due`/`rate`/`tests/daily` callers unconfirmed** — verify via grep before assuming any
  frontend or other agent depends on them yet.

### 9.8 Exit criteria

All AGT-06/AGT-07 endpoints have integration coverage at the agent level (direct HTTP, no Kong)
including the idempotency and resilience cases above; the Notification-Service-facing
`/internal/reminders` contract is fully covered since it's the one production-traffic path in
this phase; the "no public route" gap is explicitly raised with the team rather than silently
worked around with an agent-level-only test suite presented as equivalent to user-facing
coverage.

## 10. Phase: AI Conversation / Speaking Tutor

### 10.1 Phase-level blocker — the real-time path is a stub, not a partial implementation

This is the least-ready phase in the system. Confirmed by reading the actual files, not just the
roadmap notes:
- `agents/agt03_tutor/websocket_handler.py` is a **docstring-only stub**:
  `"""TODO Phase 6: implement full WebSocket handling, ticket validation, per-turn pipeline,
  session end + transcript analysis."""` — no code.
- `agents/agt03_tutor/pipeline.py` (the documented STT→LLM→TTS per-turn pipeline) is **also a
  docstring-only stub**.
- **No TTS implementation exists anywhere in the repo** (`grep` for any TTS client/class across
  `agents/`, `services/`, `packages/` returns nothing real) — confirmed, matches
  `CLAUDE.local.md`'s tracked gap.
- No Kong route for AGT-03 or the documented hybrid-ingress WebSocket-ticket pattern exists in
  `gateway/kong/kong.yml`.

What **does** work today: AGT-03's plain REST session lifecycle (`/sessions/start|turn|end|state`
in `main.py`/`service.py`) is real, working code — it just isn't the WebSocket/streaming/TTS
experience described in the README. Test what exists; don't write tests against the WebSocket
contract until `websocket_handler.py`/`pipeline.py` have actual implementations.

### 10.2 Components & data flow (current, REST-only reality)

```
(no Kong route — direct agent call only, dev/test access)
POST AGT-03 /sessions/start  {clerk_user_id, skill_focus, session_id?}
  → fetch AGT-01 profile + AGT-02 active plan (best-effort, see 10.4)
  → POST AGT-06 /sessions/{id}/state   ["critical path: raises if AGT-06 STM unavailable"]
  → (live mode) LLM opening message via call_llm(AgentID.AGT03)
  ← {session_id, opening_message, profile_loaded, plan_loaded}

POST AGT-03 /sessions/turn   {session_id, user_message? | audio_base64?}
  → if audio_base64: agt03_tutor/asr.py → Groq Whisper (mock mode returns canned transcript;
     429 from Groq → {fallback: true, source: "web_speech_fallback"}, client must handle this —
     no server-side fallback STT exists)
  → appends user turn to AGT-06 STM context (best-effort, warns on failure), reads back context,
     calls LLM (mock mode: canned `"[MOCK LLM AGT03] Got it..."` string) with full context as
     message history, appends assistant turn to STM (best-effort)
  → confirmed: process_turn does **not** call AGT-04 at all — feedback is a separate,
     client-driven call to /feedback/speaking, not part of the turn response
  ← {session_id, assistant_message, transcript_text, mock_feedback, language} — text only, no
     TTS audio in the response today

POST AGT-03 /sessions/end    {session_id, clerk_user_id, skill_focus}
  → POST AGT-06 /sessions/{id}/consolidate   (best-effort, logged warning on failure)
  → emit Kafka event (only if this call owned the session's start_time — see 10.4)

GET  AGT-03 /sessions/{id}/state → proxies AGT-06's session state, {state: null} on 404

POST AGT-04 /feedback/speaking       {transcript, session_id, clerk_user_id, duration_seconds,
                                       skill_domain} → dual-writes errors to AGT-06 STM + Kafka
                                       `agent.errors`, returns immediate feedback
POST AGT-04 /feedback/writing        {draft, prompt, session_id, clerk_user_id} → quality scores
                                       + annotated grammar errors, target latency <20s
POST AGT-04 /feedback/comprehension  (confirm request/response shape — not yet inspected)
```

### 10.3 Preconditions / test data

- `INFERENCE_MODE=mock` for the bulk of functional tests (deterministic canned transcript/LLM
  responses); a separately-tagged live-mode smoke test for the Groq Whisper integration only
  (cost/flakiness, same rationale as the LLM-mock strategy in section 4).
- A base64-encoded short audio clip (under Groq's 10-second minimum billing unit, per the
  `asr.py` comment) to test the buffering-before-send behavior, plus one long enough to send
  immediately.
- A way to simulate Groq returning HTTP 429 (mock the `httpx` call) to exercise the
  `web_speech_fallback` path.
- AGT-01/AGT-02/AGT-06 either real (integration) or mocked (unit-level `service.py` tests) —
  cover both: unit tests with all three mocked to isolate AGT-03's own logic, plus one true
  integration test with all real dependencies up.

### 10.4 Functional test cases

**Session lifecycle — Integration**
- `start_session` happy path with real AGT-01/AGT-02/AGT-06 up → session created,
  `profile_loaded`/`plan_loaded` both true, opening message present (mock-mode canned message in
  non-live tests).
- AGT-01 or AGT-02 unreachable during start → per the code comment, profile/plan fetch appears
  to be best-effort (`profile_loaded`/`plan_loaded` flags suggest graceful degradation) — confirm
  this by reading `_fetch_profile`/`_fetch_plan` and assert the session still starts with the
  flag set `false`, not a hard failure.
- AGT-06 STM unavailable during start → **this is documented as the one hard-failure path**
  ("Critical path: raises if AGT-06 STM is unavailable") — assert `start_session` actually raises/
  fails the request, and that no orphaned session profile is left behind (the code explicitly
  orders writes to avoid this — verify the ordering invariant holds under a forced AGT-06
  failure injected mid-call).
- `process_turn` with neither `user_message` nor `audio_base64` → `ValueError` → 422.
- `process_turn` against a session id that was never started (or already ended) → `ValueError`
  with the documented message → 422.
- `process_turn` with `audio_base64` → ASR called, transcript used as the turn's text; with
  `user_message` → ASR skipped entirely (assert `asr.transcribe` is not invoked in this branch).
- ASR returns empty/None text (e.g. silence) → `transcript_text` falls back to `""`, turn
  processing continues rather than erroring — confirm this doesn't produce a nonsensical LLM
  response in live mode (manual/exploratory check, not easily asserted automatically).
- Groq 429 → fallback signal returned to caller; **no test should assume server-side STT
  fallback exists** — the client/web-speech-API is the only fallback, per the code comment.
- `end_session` for a session that's already ended (start_time popped already) → logs a warning,
  returns gracefully (doesn't crash) — `duration_minutes` falls back to `0.0`.
- `end_session` triggers AGT-06 consolidation; AGT-06 unreachable → warning logged, `consolidated:
  false`-equivalent, session end still completes (best-effort, matches the pattern elsewhere in
  the system).
- Kafka emit on session end only fires if the call "owned" the session (`start_time` was present)
  — test the double-end-call case specifically to confirm no duplicate event fires.
- `GET /sessions/{id}/state` for an unknown session → `{state: null}`, not a 404 to the client
  (AGT-03 translates AGT-06's 404 into a 200-with-null).
- **In-memory session state caveat**: `_SESSION_PROFILES`/`_SESSION_START_TIMES`/
  `_SESSION_TURN_COUNTS` are process-local Python dicts, not Redis/DB-backed — a session started
  on one AGT-03 instance/replica is invisible to another, and a process restart silently drops
  all in-flight sessions. This is a real architectural gap for any multi-replica deployment; add
  a test that documents the gap (start on a fresh process, confirm state is unrecoverable after
  simulated restart) rather than treating it as untestable.

**AGT-04 Feedback — Integration**
- `/feedback/speaking` happy path → immediate feedback returned, error events appear in both
  AGT-06 STM (`/sessions/{id}/errors`) and on the Kafka `agent.errors` topic (dual-write — assert
  both sides, since a partial-write bug here would silently lose data on one side).
- `/feedback/writing` happy path → quality scores + annotated errors; **latency assertion**: the
  doc states a <20s target — worth an actual timed test against a realistic draft length, not
  just functional correctness.
- `/feedback/comprehension` is a **hardcoded stub**: always returns `{score: 0.5, feedback:
  "[STUB]...", barrier_type: null}` regardless of input, per its own docstring ("TODO Phase 4:
  ... Returns 0.5 (neutral) until Phase 4 — callers must not use this score to drive difficulty
  adaptation"). Test that it returns exactly this constant shape (a contract test, not a
  correctness test — there is no real logic to validate yet) and, more importantly, **grep any
  caller** (e.g. AGT-09 recommendation, AGT-02 plan adaptation) to confirm none of them are
  silently treating this neutral stub score as a real signal already — that would be a live bug,
  not just a future gap.
- `/feedback/session-end` is **also a hardcoded stub** (`"[STUB] Session summary not yet
  implemented"`, `errors_by_skill: {}`) — same treatment: contract-test the constant shape, then
  check for premature callers.
- Dual-write partial failure (Redis STM write succeeds, Kafka publish fails, or vice versa) —
  determine whether this is transactional/compensated or genuinely a "best effort, may diverge"
  design; write a test that surfaces actual behavior either way rather than assuming.

### 10.5 Cross-boundary contract checks

- AGT-03 → AGT-06 `/sessions/{id}/state` (critical path) vs. AGT-03 → AGT-06 `/consolidate`
  (best-effort) — these are two different failure-handling philosophies for calls to the *same*
  dependency within the *same* agent; both need explicit coverage so a future refactor doesn't
  accidentally swap which one is critical.
- AGT-04's dual-write contract (STM + Kafka) — both sinks need their own assertion, see 10.4.

### 10.6 Non-functional considerations

- **Performance**: writing feedback's <20s target is the one explicit latency SLA found in this
  phase — test it for real. Speaking turn latency (STT round-trip + LLM) matters for a
  conversational UX but has no documented target yet — flag as worth establishing one before
  this phase is considered production-ready.
- **Resilience**: Groq STT 429 fallback (covered above) and AGT-06 best-effort-vs-critical-path
  split are this phase's main resilience surface.
- **Security**: no Kong/JWT layer in front of AGT-03/AGT-04 at all today — every test in this
  phase is effectively testing an internal-network-only surface; flag that this needs a Kong
  route + JWT (and the documented ticket-based hybrid-ingress exception for the WebSocket itself)
  before any of it is internet-facing.

### 10.7 Known gaps

- **WebSocket real-time streaming pipeline (`websocket_handler.py`, `pipeline.py`) is
  unimplemented** — a docstring, not code. No test plan can cover it until it's built; revisit
  this section once it lands.
- **TTS does not exist anywhere** — any "AI speaks back to the learner" user story is untestable
  end-to-end today.
- **No Kong route for AGT-03/AGT-04** — REST session lifecycle is reachable only inside the
  compose network.
- **In-memory session state** — single-instance constraint, see 10.4.
- **`/feedback/comprehension` and `/feedback/session-end` are hardcoded stubs** — any feature
  depending on real comprehension scoring or session summaries (e.g. AGT-08/AGT-09 in Phase 11)
  is working against a constant neutral value, not a real signal. Cross-check Phase 11 for any
  test that accidentally assumes this is real.

### 10.8 Exit criteria

The REST session lifecycle (start/turn/end/state) and both characterized AGT-04 feedback
endpoints have full integration coverage including every best-effort-vs-critical-path branch
identified above. This phase is explicitly **not** exit-criteria-complete in the way other phases
are — its exit criteria is "everything that currently exists is tested," with the WebSocket/TTS/
Kong-ticket gap formally logged as blocking the *feature's* completion, separate from this test
plan's completion.

## 11. Phase: Progress Analysis & Recommendations

### 11.1 Overview & user story

In the background, the system analyzes a learner's accumulating session/error history for
patterns (plateaus, risk of disengagement) and surfaces personalized content recommendations on
their dashboard.

### 11.2 Components & data flow

```
AGT-06 (consolidate) → emits Kafka `agent.consolidation.complete` {clerkUserId, sessionId?}
  → AGT-08 consumer (consumer group agt08-consolidation-complete) → run_analysis(clerkUserId)
      "All algorithms are stubs at scaffold — returns empty pattern list" (own docstring)
      → (intended, not yet real) emits `agent.pattern.events` {clerkUserId, type} per pattern
  → AGT-09 consumer (consumer group agt09-pattern-events) → invalidate_cache(clerkUserId)
      (Redis `reco:{userId}` key deleted — next GET recomputes)

AGT-02 (re-plan, Phase 7) → POST AGT-09 /recommendations/{userId}/invalidate  (direct HTTP, not
                                                                                Kafka, despite the
                                                                                similar effect)

(no Kong route found)      → GET  AGT-08 /analysis/{userId}/run    (manual trigger)
(no Kong route found)      → GET  AGT-08 /analysis/{userId}/latest  (always returns the
                                                                       hardcoded stub shape below)
(no Kong route found)      → GET  AGT-09 /recommendations/{userId}
  → AGT-09 cache miss → _compute_recommendations:
      → GET AGT01_BASE/profile/{userId}           (direct agent-to-agent, no auth needed — both
                                                      sides are inside the compose network)
      → GET LMS_BASE/modules                       (⚠ see 11.4 — this call sends **no
                                                      Authorization header**, but `/modules` is
                                                      `requireAuth`-protected)
      → on any exception (incl. the 401 from the call above) → cold-start fallback, 3 hardcoded
        stub recommendations
      → cache result in Redis, TTL 3600s
```

### 11.3 Preconditions / test data

- A user profile with `cold_start_flag: false` (so the test can actually attempt to reach the
  non-cold-start branch and observe what happens) and one with `cold_start_flag: true`.
- Real Learning Materials Service up with seeded modules, reachable at the same base URL AGT-09
  uses, so the auth-header gap (11.4) reproduces against the real route rather than a mock that
  would hide it.
- Redis flushed between test runs for cache-key isolation (`reco:{userId}`).
- A way to manually publish `agent.consolidation.complete` and `agent.pattern.events` onto Kafka
  to test the consumers in isolation from their real upstream producers.

### 11.4 Functional test cases

**AGT-08 Analysis — Integration**
- `POST /analysis/{userId}/run` → confirm it really does return an empty pattern list today
  (own docstring says so) — write this as an explicit assertion, not a TODO, so it flips
  automatically (and visibly) the day real pattern detection lands.
- `GET /analysis/{userId}/latest` → always `{patterns: [], velocity: {}, forecast: {},
  insufficient_data: true, stub: true}` regardless of `userId` or any prior `/run` call — assert
  the `stub: true` marker explicitly; this is the cleanest "is this still a stub" signal in the
  whole codebase and should be the first thing a future re-run of this test suite checks.
- `agent.consolidation.complete` consumer: publish a valid event → `run_analysis` is invoked
  (assert via a side effect, e.g. a log line or — once real — a pattern result); publish an event
  missing `clerkUserId` → warning logged, no crash, no analysis attempted.
- At-least-once redelivery of the same `agent.consolidation.complete` event → `run_analysis` is
  documented as idempotent ("reads, analyses, emits") — verify no duplicate side effects
  (meaningless today since the algorithm is a no-op stub, but write the test now so it's
  meaningful the moment real analysis logic lands; an idempotency bug introduced then would
  otherwise ship untested).

**AGT-09 Recommendation — Integration, including the auth gap**
- **Reproduce the auth gap directly**: with a non-cold-start profile and a real Learning
  Materials Service requiring auth on `/modules`, call `GET /recommendations/{userId}` on a cold
  cache → assert the *actual* current behavior: the `/modules` call fails (401/whatever
  `requireAuth`'s rejection shape is), the broad `except` swallows it, and the response is the
  **cold-start fallback list despite `cold_start_flag: false`**. This is the single highest-value
  test in this phase — it turns an easily-missed silent failure into a named, asserted bug.
  Decide with the team whether the fix is (a) AGT-09 forwards a service-level JWT/internal
  secret, or (b) `/modules` gains an `/internal/modules` no-auth-needed twin like
  `/internal/catalog/summary` already provides for AGT-02 — either way, write the test against
  current behavior now and update it once fixed, don't pre-write it against the fix.
- Cache hit: second call within TTL → served from Redis, `AGT01_BASE`/`LMS_BASE` not called again
  (assert via call-count, not just response equality) — confirms caching actually short-circuits
  the (broken) compute path most of the time in practice, which is presumably why this bug has
  gone unnoticed.
- `cold_start_flag: true` → cold-start fallback, **and** confirm AGT-01/LMS aren't even called
  (early branch) — distinguishes "intentional cold start" from "fell through to cold start by
  accident," which is exactly the ambiguity the bug above creates today.
- AGT-01 unreachable → falls back to cold-start (same broad except) — same caveat as above:
  verify this is the *intended* fallback target for this failure mode, not just an accident of
  one shared except block covering two very different failure causes.
- `POST /recommendations/{userId}/invalidate` → cache key deleted; subsequent GET recomputes
  (hits the same auth gap again, naturally, unless fixed).
- `agent.pattern.events` consumer: valid event → cache invalidated; missing `clerkUserId` →
  warning, no crash.
- `score_items` (the real, non-cold-start scoring function in `scorer.py`) — not yet inspected in
  this pass; once the auth gap is fixed (or bypassed for testing), add dedicated unit tests for
  its scoring logic directly, since it currently can never run end-to-end to be exercised any
  other way.

### 11.5 Cross-boundary contract checks

- AGT-08 → Kafka `agent.pattern.events` → AGT-09 consumer: schema/field-name agreement
  (`clerkUserId`, `type`) — both sides read the same dict keys; a typo on either side fails
  silently (consumer just won't find `clerkUserId`, logs a warning, moves on) rather than loudly,
  so a contract test asserting the exact field names on both producer and consumer is worth more
  here than in topics with stricter typing.
- AGT-02 → AGT-09 `/recommendations/{userId}/invalidate`: direct HTTP, not Kafka — confirm this
  asymmetry (everything else in this phase is event-driven) is deliberate and not a half-migrated
  leftover.
- AGT-09 → Learning Materials `/modules`: the auth-boundary bug above is fundamentally a contract
  violation (caller doesn't meet the callee's stated auth requirement) — this is the canonical
  example of why this section of the template exists.

### 11.6 Non-functional considerations

- **Resilience**: AGT-09's single broad `except Exception` around two unrelated calls (profile
  fetch, catalog fetch) conflates "AGT-01 is down" with "auth rejected my request to LMS" into
  the same fallback path — acceptable as a safety net, but it actively hides the auth bug from
  any monitoring that only watches for elevated error rates, since this path never errors
  user-visibly. Worth a recommendation to split this for observability, separate from the auth
  fix itself.
- **Performance**: Redis caching (1hr TTL) already addresses the main perf concern for this
  phase; no additional load testing seems warranted until real (non-stub) analysis algorithms
  exist.

### 11.7 Known gaps

- **AGT-09's auth gap to Learning Materials' `/modules`** — see 11.4, the headline finding of
  this phase. Likely means **every current non-cold-start user is silently getting cold-start
  recommendations** in any environment where `/modules` actually enforces auth (confirm this is
  true in the deployed environment, not just in theory, before escalating it as urgent).
- **AGT-08's analysis algorithms are entirely stubbed** (empty patterns, hardcoded `stub: true`)
  — no CUSUM/PELT/risk-model logic exists yet (`TODO Phase 8+`).
- **AGT-09's composite multi-factor scoring is also `TODO Phase 8+`** — `score_items` is real
  code but its actual sophistication needs a direct read before claiming any depth of coverage
  beyond "it runs."
- Downstream effect: any dashboard/insights UI built against AGT-08's `/latest` is necessarily
  showing `insufficient_data: true` for every user today — confirm `apps/web` either handles this
  gracefully or hasn't built this UI yet.

### 11.8 Exit criteria

The AGT-09 auth-gap test exists, passes (i.e., correctly demonstrates the current broken
behavior), and has been explicitly flagged to the team as a bug rather than left as an
accepted-and-forgotten test assertion; AGT-08's stub-shape contract tests exist and will catch
the transition the moment real algorithms land; both Kafka consumer pairs (08→09 pattern events,
06→08 consolidation) have malformed-event and idempotency coverage.

## 12. Phase: Habit-Building & Notifications

### 12.1 Overview & user story

A learner opens an exercise library with four tabs (today's plan, due-for-review, recommended,
browse), builds a daily streak, gets nudged back if they lapse, and receives reminder/
achievement notifications via Novu.

### 12.2 Components & data flow

```
(no Kong route found)  → GET  AGT-10 /library/{userId}
  → parallel fan-out, partial-failure-tolerant (asyncio.gather, return_exceptions=True):
      AGT-02 /plans/{userId}/today        → todaysPlan
      AGT-07 /schedule/{userId}/due        → dueForReview
      AGT-09 /recommendations/{userId}     → recommended  (⚠ Phase 11's auth-gap bug means this
                                                              tab silently always shows cold-start
                                                              content for non-cold-start users)
      LMS    /modules                      → browse        (⚠ same root-cause bug as Phase 11 —
                                                              this call also has no Authorization
                                                              header against a requireAuth route,
                                                              so **the Browse tab is always
                                                              empty** today, every user, every
                                                              time)

(no Kong route found)  → POST AGT-10 /streak/{userId}/record  {current_streak, session_duration_minutes}
(no Kong route found)  → GET  AGT-10 /streak/{userId}
(no Kong route found)  → POST AGT-10 /re-engagement {clerk_user_id, days_since_last_session,
                                                       risk_score, streak_days, review_due_count}
  → check_re_engagement() → Novu template name or null

AGT-03 (Phase 10, `end_session`) → emits Kafka `session.end` {clerkUserId, durationMinutes}
  → AGT-10 consumer `handle_session_end` (consumer group `agt10-session-end`) → reads current
    Redis streak, calls `record_session_complete` → on hitting a milestone, looks up
    `_ACHIEVEMENT_TYPE_MAP[milestone_name]` and emits `achievement.unlocked` via `emit_ts_event()`
  → this trigger chain is **independent of Phase 8's progress-advancement gap** — it's driven by
    AI Tutor session completion (streak-based milestones), not by exercise grading/path
    progression. Confirmed by matching the literal topic string (`"session.end"`) on both the
    AGT-03 producer and AGT-10 consumer sides — they agree, despite a stale docstring header in
    `agt10_habit/consumers.py` that says `agent.session.end` (cosmetic inconsistency, not a
    functional bug — worth a one-line doc fix, not a test).
  → so: the achievement path reached through Phase 10's conversation flow *can* fire end-to-end
    today, but **only for the 7-day streak milestone**: `record_session_complete` checks
    `new_streak in (7, 30, 100)` and calls `send_milestone(..., f"{new_streak}-day streak")`, but
    `_ACHIEVEMENT_TYPE_MAP` only has a `"7-day streak"` key — `"30-day streak"`/`"100-day streak"`
    fall through to "unrecognised milestone, skip emit". This is already deliberately tested
    (`test_send_milestone_30_day_streak_does_not_emit`/`..._100_day_...` exist in
    `agt10_habit/tests/test_service.py`), so it's a known/accepted current limitation, not a
    fresh bug — but worth flagging as a product gap (no 30/100-day streak celebration) distinct
    from the genuinely-undiscovered bugs elsewhere in this plan. `"first-lesson"` is in the map
    with **no producer anywhere in the repo** — reserved for a future grading/progress-based
    trigger that doesn't exist yet (consistent with Phase 8's progress-advancement gap).
    `"level-up"` has a code comment explicitly deferring it to AGT-05 once IRT thresholds exist.

Kafka `achievement.unlocked` → notification-service `handleAchievementUnlocked`
  → withDedup(ProcessedEvent) → NovuClient.triggerNotification(workflowId:
    'achievement-unlocked', subscriberId: userId, payload: {achievementType, metadata})

Kafka `learning-path.ready` (Phase 7) → notification-service `learningPathReady.ts` consumer
Kafka `user.upserted` (User Service)   → notification-service `userUpserted.ts` consumer

notification-service scheduler (node-cron, hourly):
  dailyReminder.ts  → withScheduledReminder (dedup via ScheduledReminderRun) → per-user
                       IANA-timezone time-of-day match against UserSettings.reminderTime →
                       GET AGT-07 /internal/reminders/{userId}/context (x-internal-secret) →
                       Novu 'daily-reminder' {dueReviewCount}
  vocabOfTheDay.ts  → same guard/context-fetch pattern → Novu workflow with vocab-of-the-day
                       payload (always meaning: "", per Phase 9's known gap)
```

### 12.3 Preconditions / test data

- A real Learning Materials Service requiring auth on `/modules` (same fixture as Phase 11) so
  the Browse-tab bug reproduces.
- AGT-02/AGT-07/AGT-09 all up (mix of real and stub responses, matching their actual current
  state from Phases 7/9/11) to exercise the partial-failure fan-out realistically.
- `UserSettings` rows with a range of IANA timezones and `reminderTime` values, including one
  that matches "now" in the test's frozen-clock setup and one that doesn't, to test the
  scheduler's time-of-day match precisely.
- A `MockNovuClient` (per the existing DI pattern) for fast unit/integration tests; a real Novu
  sandbox call is out of scope (no sandbox account exists yet, per `CLAUDE.local.md`).
- `ProcessedEvent`/`ScheduledReminderRun` tables clean between test runs to test dedup
  correctly rather than accidentally relying on leftover rows.

### 12.4 Functional test cases

**AGT-10 Exercise Library — Integration**
- Happy path with all four upstreams healthy → all four tabs populated.
- **Reproduce the Browse-tab bug directly**: `/modules` requires auth, AGT-10 sends none → 401 →
  caught by `_fetch`'s broad except → `browse: []` always, regardless of catalog content. Same
  treatment as Phase 11's AGT-09 finding: write this as a named, currently-failing-as-designed
  assertion, and flag the fix decision (forward a token vs. add an `/internal/modules` twin) to
  the team — note that fixing Learning Materials' auth model would fix *both* this and the
  Phase 11 bug simultaneously, since they share a root cause.
- Any one upstream down (e.g. AGT-02 unreachable) → that tab is `[]`, the other three still
  populate — this is the partial-failure contract `asyncio.gather(..., return_exceptions=True)`
  is supposed to guarantee; test it explicitly per-upstream, not just once.
- All four upstreams down → `{todaysPlan: [], dueForReview: [], recommended: [], browse: []}`,
  200 response, not a 500 — confirms the library endpoint itself never fails outright.

**AGT-10 Streak & Re-engagement — Integration**
- `POST /streak/{userId}/record` increments correctly given `current_streak` +
  `session_duration_minutes` — inspect `service.py::record_session_complete` for the actual
  "qualifying session" threshold before asserting specific numbers.
- `GET /streak/{userId}` for a user with no recorded sessions → confirm default (likely `0`, but
  verify against Redis-backed `get_streak`'s actual behavior on a cache miss).
- `record_session_complete` crossing into `new_streak == 7` → `achievement.unlocked` emitted with
  `achievementType: "7-day-streak"`; crossing into `30` or `100` → **no emit** (matches existing
  unit tests; add an integration-level equivalent that goes through the real `/streak/record`
  HTTP endpoint and asserts on the Kafka side, not just the unit-mocked `emit_ts_event` call).
- `POST /re-engagement` with `days_since_last_session`/`risk_score`/`streak_days`/
  `review_due_count` combinations that should and shouldn't trigger → `{triggered: bool,
  template: str|null}` — needs `check_re_engagement`'s actual threshold logic read before writing
  precise test data; cover at least one clearly-should-trigger and one clearly-shouldn't case to
  start.

**Notification Service — Kafka consumers — Integration (real Kafka + real Postgres)**
- `achievement.unlocked` happy path → Novu triggered once with correct `workflowId`/
  `subscriberId`/payload; redelivery of the *same* `eventId` → `withDedup` prevents a second
  Novu call (assert via `MockNovuClient` call count, not just "no error").
- `achievement.unlocked` event missing/malformed fields → confirm the consumer's behavior (crash
  vs. skip vs. dead-letter) — not yet inspected, read `AchievementUnlockedEvent`'s schema and the
  envelope-unwrapping logic before asserting.
- `learning-path.ready`/`user.upserted` consumers — per `CLAUDE.local.md`, these needed no code
  changes during the Phase 6-TS cutover; confirm with a live test against the AI engineer's real
  producers (`agt_orchestrator`, User Service) that the envelope shape genuinely still matches,
  rather than trusting the "no changes needed" note as still-current.
- **`review.due` consumer/topic was removed entirely** (per the cutover) — confirm no leftover
  code/test still references it, and that nothing publishes to a topic with that name anymore
  (a stray producer would be silently dropped with no consumer group to receive it).

**Notification Scheduler — Integration**
- `dailyReminder`/`vocabOfTheDay`, run at an hour matching a user's `reminderTime` in their IANA
  timezone → Novu triggered once; run again within the same calendar day → `ScheduledReminderRun`
  dedup prevents a second trigger (test by running the job twice in the same simulated hour).
- A user whose local time does *not* match the current run hour → not triggered this run.
  Critical case: a timezone whose UTC offset means the same UTC instant maps to two different
  *local* hours across DST transitions — at minimum confirm the matching logic uses real IANA
  timezone data (not a fixed UTC offset) so this class of bug can't occur silently.
  `dailyReminder`/`vocabOfTheDay` calling AGT-07's `/internal/reminders/{userId}/context` with a
  wrong/missing `x-internal-secret` → 403 propagates as a job failure for that user without
  crashing the whole scheduler run for other users (verify isolation between per-user job
  iterations).
- `vocabOfTheDay` payload always has `meaning: ""` (Phase 9's tracked gap) — same "assert the
  known gap explicitly" treatment as elsewhere in this plan.

### 12.5 Cross-boundary contract checks

- AGT-10's `achievement.unlocked` emission (via `emit_ts_event()`) must match the
  `AchievementUnlockedEvent` schema notification-service's consumer expects — this is the
  Python↔TS event envelope boundary; a field-name or casing mismatch (`clerkUserId` vs.
  `clerk_user_id`, per the architecture doc's per-language casing convention) is the most likely
  failure mode and deserves an explicit schema-conformance test, not just an E2E happy path.
- Scheduler → AGT-07 `/internal/reminders` secret check — same pattern as every other
  `/internal/*` boundary in this plan; one shared test fixture for "wrong secret → 403" across
  all of them would reduce duplication (worth a shared test helper, not a new abstraction in
  production code).

### 12.6 Non-functional considerations

- **Resilience**: the exercise-library fan-out and the Kafka consumers' dedup-on-redelivery are
  this phase's main resilience surfaces — both covered above.
- **Security**: `/internal/reminders`'s secret check, already covered.
- **Performance**: the hourly scheduler iterates all users with a matching local time — at scale
  this is an N-user-per-hour fan-out of HTTP calls to AGT-07; worth a basic load/timing check once
  user counts are non-trivial, not urgent today.

### 12.7 Known gaps

- **Browse-tab bug** (AGT-10 → LMS `/modules`, no auth) — same root cause as Phase 11's
  Recommended-tab bug. Fixing Learning Materials' auth boundary for server-to-server catalog
  reads fixes both at once; recommend tracking as one ticket, not two.
- **Only the 7-day streak achievement actually fires** — 30-day/100-day streaks are detected
  (`new_streak in (7, 30, 100)`) but never emitted, since `_ACHIEVEMENT_TYPE_MAP` has no entry
  for them; already covered by existing tests asserting the no-emit behavior, so this is a known/
  accepted limitation, not newly discovered — but still a product gap worth a ticket (add the map
  entries + Novu templates) if 30/100-day celebrations are in scope.
- **`first-lesson` achievement has no producer anywhere** — reserved in the map, blocked on
  Phase 8's progress-advancement gap (lesson completion isn't tracked at all today, so there's
  nothing to trigger this from).
- **`level-up` achievement was never implemented** — documented in-code as intentional, deferred
  to AGT-05 once IRT theta thresholds exist for CEFR level advancement detection.
- **`vocabOfTheDay.meaning` always empty** — tracked in Phase 9, surfaces again here.
- No Kong route for any AGT-10 endpoint — same "agent-internal only" pattern as Phases 9/10/11.

### 12.8 Exit criteria

The shared-root-cause auth bug is documented with one reproducing test in this phase (cross-
referencing rather than duplicating Phase 11's); the achievement-trigger chain (AGT-03→AGT-10→
Kafka→Novu) has integration coverage for the working 7-day-streak path plus explicit coverage of
the accepted 30/100-day and unimplemented `first-lesson`/`level-up` gaps; every Kafka consumer +
scheduler job has dedup/idempotency and malformed-input coverage.

## 13. Phase: Translation

### 13.1 Overview & user story

A Vietnamese learner sees explanations and translations calibrated to their actual reading
ability — full Vietnamese support below B1, bilingual through B1-B2, English-only immersion
above B2 — and conversation practice always stays English-only regardless of level to force
immersion.

### 13.2 Components & data flow

```
(no Kong route found) → POST AGT-11 /translate  {content, clerk_user_id, session_type?}
(no Kong route found) → POST AGT-11 /explain     {error_type, example, clerk_user_id, session_type?}
(no Kong route found) → GET  AGT-11 /zone/{userId}?session_type=exercise

AGT-11 → GET AGT-01 /profile/{userId} → irt_theta.R (reading-ability theta) → get_language_zone()
  → zone ∈ {vi_primary (theta_R < -0.5), bilingual (-0.5..1.0), en_only (>1.0)}
  → session_type == "conversation" **always forces en_only**, overriding theta_R entirely
AGT-11 → Redis cache (cache.py) for translate() — "cache-first... >70% of requests served from
  cache" per the `/translate` docstring (a target, not yet measured — see 13.6)
```

### 13.3 Preconditions / test data

- Test profiles spanning all three zones: `irt_theta.R` well below -0.5, exactly at each
  boundary (-0.5, 1.0 — boundary-inclusivity matters, see 13.4), and well above 1.0.
- A profile with no `irt_theta.R` set at all (new user, never assessed) to test the `.get("R",
  0.0)` default.
- Redis flushed between cache-behavior tests so "cached: false" on first call is reliably
  observable.
- A representative grammar `error_type`/`example` pair for `/explain`.

### 13.4 Functional test cases

**Zone computation — Unit (pure function, no I/O — fast, exhaustive)**
- `theta_r = -0.51` → `vi_primary`; `theta_r = -0.5` exactly → boundary is `< -0.5`, so `-0.5`
  itself falls into `bilingual`, **not** `vi_primary` — assert the exact boundary behavior, this
  is the kind of off-by-the-comparison-operator bug that's easy to introduce in a refactor.
- `theta_r = 1.0` exactly → `<=` makes this `bilingual`, not `en_only`; `theta_r = 1.01` →
  `en_only`. Same rationale: lock in the exact boundary semantics with a test per boundary.
- `session_type = "conversation"` with `theta_r` at every zone (including deep `vi_primary`
  territory) → always `en_only` — this override is the single most product-important rule in
  this phase (immersion-during-speaking is a deliberate pedagogical choice) and deserves its own
  explicit test independent of the boundary tests above.
- `session_type` values other than `"conversation"` (`"exercise"`, `"assessment"`, `"review"`,
  and an unrecognized string) → all fall through to theta-based zoning identically — confirm
  there's no unintended special-casing for `"assessment"`/`"review"` despite them being named in
  the docstring's type union.

**`/translate` — Integration**
- `en_only` zone → response has `translated == original` (no actual translation call made —
  assert the cache/translation path is skipped entirely, not just that strings happen to match).
- `bilingual`/`vi_primary` zones → `translate()` invoked, `cached: false` on a cold cache key,
  `cached: true` on a repeat call with the same `(content, zone)` pair.
- Different `zone` for the same `content` (e.g. same sentence requested once in `bilingual` and
  once in `vi_primary`) → **separate cache entries** — verify the cache key includes zone, not
  just content, since a Vietnamese-primary translation and a bilingual one are presumably
  different outputs.
- AGT-01 unreachable when fetching the profile → falls back to `theta_r = 0.0` (bilingual
  midpoint, "safe default" per the code comment) — confirm the fallback zone is genuinely
  `bilingual` (0.0 is between -0.5 and 1.0) and not accidentally `vi_primary`/`en_only` if the
  boundary constants ever change without updating this comment.

**`/explain` — Integration**
- Confirmed: `explain_error` is a thin wrapper — it formats `error_type`/`example` into a single
  string (`"Grammar error type: {error_type}\nExample: {example}"`) and calls `translate_for_user`
  directly, so it has **identical** zone-sensitivity and caching behavior to `/translate`, not
  independent logic. No separate boundary/zone test matrix needed here — one happy-path
  integration test confirming the formatted string round-trips through the same pipeline is
  sufficient; the real coverage burden already lives in `/translate`'s test cases above.
- Used by AGT-04 (Phase 10) when rendering grammar-error feedback — worth one cross-phase
  contract test confirming AGT-04 actually calls this with the shape AGT-11 expects, since that's
  the one real caller found in the repo.

**`/zone/{userId}` — Integration**
- Returns `{zone, theta_r}` consistent with whatever `/translate`/`/explain` would compute
  internally for the same user/session_type — useful as a frontend "what mode am I in" indicator
  once wired up; verify it's a pure read with no side effects (no cache writes, no profile
  mutation).

### 13.5 Cross-boundary contract checks

- AGT-11 → AGT-01 `/profile/{userId}` is a direct agent-to-agent call inside the compose network,
  same trust model as AGT-09's profile fetch in Phase 11 — but note AGT-11 does **not** hit any
  `requireAuth`-protected TS service route the way AGT-09/AGT-10 do for the catalog, so it does
  not share their auth-gap bug. Worth noting explicitly so a future reader doesn't assume every
  agent-to-service call in this codebase is broken the same way.

### 13.6 Non-functional considerations

- **Performance**: the `/translate` docstring claims a >70% cache-hit target — if this is meant
  to be a tracked SLA rather than just an aspirational comment, add a measurement (e.g. a load
  test replaying a realistic content-repetition distribution) rather than leaving it unverified;
  otherwise downgrade the claim to "design intent" in the code comment so it doesn't read as a
  verified fact.
- **Security**: no Kong route, no auth on any AGT-11 endpoint — same "agent-internal only" status
  as most other agents; flag before any direct internet exposure.

### 13.7 Known gaps

- No Kong route for any AGT-11 endpoint — not yet wired to the frontend; reachable today only
  agent-to-agent (confirmed real caller: AGT-04 Phase 10's `analyze_speaking_turn`/writing
  feedback path calls `AGT11_BASE/explain` directly) and via direct test/dev calls.
- The >70% cache-hit claim is unverified.

### 13.8 Exit criteria

`zone.py`'s boundary logic has exhaustive unit coverage (every boundary value, every
session_type, the conversation override); `/translate` and `/zone` have full integration
coverage including the AGT-01-unreachable fallback case; the AGT-04→AGT-11 `/explain` contract
test passes against the real shape AGT-04 sends.

## 14. Phase: Cross-cutting / Platform

### 14.1 Overview

Concerns that apply across every other phase rather than belonging to one feature: identity
(Clerk sign-up/webhook, Kong JWT), account/settings, offline sync, and infra-level resilience.
Most of this phase's value is in *not* re-testing the same boundary 14 separate times — this
section is where the shared fixtures/helpers for those repeated patterns belong.

### 14.2 Identity & Auth

**Flow**: Clerk handles real signup/login; on `user.created`/`user.updated`, Clerk calls
`POST /api/webhooks/user-service/clerk` (svix-signed, **not** JWT-protected — deliberately, since
the caller is Clerk itself, not an end user — confirmed: `gateway/kong/kong.yml` has a comment
"`/health` and `/webhooks/*` routes are left unauthenticated" and the route has no `jwt` plugin).
User Service verifies the svix signature, upserts the `User`/`UserSettings`, publishes
`user.created`/`user.updated`/`user.upserted`. Every other `/api/*` route (`/api/users`,
`/api/modules`, `/api/lessons`, `/api/exercises`, `/api/assessment`, `/api/orchestrate/*`) carries
Kong's `jwt` plugin with `claims_to_verify: [exp]`.

**Test cases**
- Webhook with a valid svix signature, `user.created` → user/settings created, `user.created` +
  `user.upserted` both published.
- Webhook with an **invalid/missing** svix signature → 401 `UnauthorizedError`, no DB write, no
  event published — this is the one place in the system that authenticates via signature instead
  of JWT, and it's also the one place external (non-Clerk-frontend) traffic can reach
  unauthenticated by path, so signature verification correctness matters more here than anywhere
  else in the system.
- Webhook payload missing a primary email → 400 `VALIDATION_ERROR`, no partial user created.
- `GET /api/users/me` with a valid JWT for a user that has no corresponding `User`/`UserSettings`
  row yet (race: Clerk session exists, webhook hasn't landed yet) → 404, not a 500 — confirms the
  webhook-lag race is handled as a clean "not found yet" rather than crashing.
- Every JWT-protected route, across every service, rejects: no `Authorization` header, an expired
  token (`exp` in the past — this is the one claim Kong actually checks), and a token signed with
  the wrong key (tampered/forged) — **build this as one shared parametrized test fixture run
  against every route**, rather than duplicating "JWT auth works" 10+ times across phases; each
  phase section above should link back here instead of re-deriving it.
- Internal-only services (no Kong route at all — AGT-03/04/06/07/08/09/10/11 today) are
  unreachable from outside the docker-compose network by construction; the test that matters is
  confirming no Kong route accidentally exists for any of them (a config-diff/lint check against
  `kong.yml` is more valuable here than a runtime test).

### 14.3 Account / Settings

`PATCH /api/users/me/settings` — reminder time, timezone, notification preferences (exact fields
depend on `validateSettingsUpdate`, not yet read in this pass — read before finalizing test data).
- Valid partial update → only specified fields change, others retain prior values.
- Invalid `reminderTime`/timezone shape → 400 from `validateSettingsUpdate`, not a Prisma-level
  constraint error leaking through.
- First-ever settings update for a user with defaulted/never-set settings → `upsert` creates
  rather than erroring — this `upsert`-not-`update` choice is deliberate per the route code; test
  it explicitly since a regression to `update` would break first-time settings changes.
- Downstream effect: `UserSettings.reminderTime`/timezone changes are read by Phase 12's
  scheduler — one shared fixture (a user whose settings were just changed mid-test) is useful in
  both places; consider a shared test data builder rather than two independent ones.

### 14.4 Offline Sync

Per `CLAUDE.local.md`, Phase 7 (offline sync endpoints) has **ownership TBD** and it's explicitly
unbuilt — "revisit now that Phase 6-TS has landed." No code to test exists. This subsection is a
placeholder until that ownership/design question resolves; don't write speculative tests against
an undesigned feature.

### 14.5 Infra-level resilience (cross-cutting, not specific to one flow)

- **Kafka broker restart mid-flow**: pick one representative producer/consumer pair already
  covered in an earlier phase (e.g. Phase 7's `learning-path.ready`) and add one test that
  restarts the broker between publish and consume, confirming at-least-once delivery still
  reaches the consumer after the broker comes back (KRaft, no persistent volume today per
  `CLAUDE.local.md` — note that a full broker *recreate*, not just restart, wipes topics; that's
  a different, environment-setup concern, not a runtime resilience case).
- **LLM router fallback (Groq → OpenRouter → Ollama)**: shared by AGT-02/03/07/09 and
  `CONTENT_GEN` — one consolidated test suite against `agents/shared/llm/router.py` covering
  Groq-down→OpenRouter, OpenRouter-down→Ollama, and all-three-down, is more valuable than
  repeating "LLM call works" per agent. Include a regression test for the retired-model-slug class
  of failure (`deepseek/deepseek-chat-v3.1:free` returning 404) — assert the router treats a 404
  from a configured model the same as any other tier failure (falls through), rather than
  surfacing it as an unhandled error, since this exact failure mode already happened once in
  production-adjacent testing per the known issues.
- **`/internal/*` secret boundary**: one shared parametrized fixture (right secret → 200ish,
  wrong/missing → 403) run against every `/internal/*` route across every service/agent that has
  one, rather than re-deriving the pattern per phase (cross-referenced from Phases 7/8/9/11/12).

### 14.6 Known gaps

- Offline sync: no code, ownership undecided.
- `validateSettingsUpdate`'s exact field/validation rules not yet read — needed before this
  subsection's test cases can be made precise rather than illustrative.
- Kafka has no persistent volume in `infra/docker-compose.yml` today — any resilience test
  involving a full container *recreate* (not just restart) must account for topic loss as
  expected behavior, not a bug.

### 14.7 Exit criteria

The shared JWT-auth fixture exists and is referenced (not duplicated) from every other phase;
the webhook signature-verification path has full positive/negative coverage; the `/internal/*`
secret-boundary fixture is shared the same way; offline sync is explicitly out of scope until
ownership lands, recorded here rather than silently dropped.

## 15. Cross-Phase Findings Summary

Concrete, reproducible issues surfaced while building this plan (not hypothetical — each was
confirmed by reading the actual code, not inferred from docs):

1. **Phase 7**: three parallel/disconnected onboarding-assessment mechanisms (orchestrator's
   profile+plan chain, Learning Materials' static scorer, AGT-05's incomplete CAT assessment).
2. **Phase 8**: naive case-insensitive-string-compare grading has no per-exercise-type
   normalization; progress advancement (`Progress.currentModuleId/...`) appears to not exist
   anywhere in the current `agents/` stack at all.
3. **Phase 9**: the entire Review Center feature has zero Kong-exposed routes — agent logic
   exists, no learner-facing API surface does.
4. **Phase 10**: the real-time WebSocket/TTS speaking pipeline is a docstring, not code;
   `/feedback/comprehension` and `/feedback/session-end` are hardcoded stubs with no current
   callers (verified, not just suspected).
5. **Phase 11**: AGT-09's recommendation engine calls a `requireAuth`-protected Learning
   Materials route with no Authorization header — likely means **every non-cold-start user
   silently gets cold-start recommendations** in any environment enforcing that auth.
6. **Phase 12**: AGT-10's exercise-library "Browse" tab has the exact same root-cause bug as #5
   (same unauthenticated call to `/modules`) — recommend one shared ticket/fix for both. Streak
   achievements only fire at 7 days; 30/100-day thresholds are detected but never emitted
   (already covered by existing unit tests, so accepted-not-undiscovered).
7. **Phase 13**: self-contained and in good shape relative to the rest of the system — no new
   bugs found, only an unverified performance claim (>70% cache hit rate).

Recommended priority if the team wants to act on these before further test-writing: **#5/#6
first** (same fix, two features affected, silently wrong product behavior today), then **#2**'s
progress-advancement question (blocks meaningfully testing "does the learner move forward" at
all), then **#3** (no Review Center API) since it blocks an entire planned feature's frontend
work, with **#4**/TTS as the longest-lead-time item.

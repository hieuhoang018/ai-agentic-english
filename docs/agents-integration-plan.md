# AI Agents Integration Plan

**Status:** Proposed — pending sign-off before implementation starts.
**Owners:** TS backend (this team) ↔ AI engineer (`agents/` Python stack).
**Last updated:** 2026-06-19.

## 1. Why this document exists

The repo now contains two independently-built backend stacks covering overlapping ground:

- `services/*` — the TypeScript 5-service architecture from `docs/implementation-plan.md`
  (Phases 0-5 complete): `user-service`, `learning-materials-service`,
  `memory-progress-service`, `ai-tutor-service`, `notification-service`.
- `agents/*` — a Python/FastAPI 11-agent stack (`agt01_profiling` … `agt11_translation`)
  implementing the README's original multi-agent vision, with real LLM routing
  (Groq → OpenRouter → Ollama), Groq Whisper STT, and LanguageTool grammar checking. Built
  by the AI engineer, merged into `main` via `feat/agt06-agt01-agt02-agt03-sprint`.

These two stacks were never wired together — separate Postgres DBs, separate Kafka topic
namespaces, no HTTP calls between them. This document defines how they get merged into one
coherent system, **splitting full service ownership** rather than partially extracting pieces
from either side.

## 2. Final ownership split

| Side | Services | Database(s) |
|---|---|---|
| **TS (this team)** | `user-service`, `learning-materials-service`, `notification-service` | `postgres-user`, `postgres-learning-materials`, `postgres-notification` |
| **Python (AI engineer)** | `agents/agt01_profiling` … `agt11_translation` (all 11) | `postgres-agents` |

**Retired entirely (TS):** `ai-tutor-service`, `memory-progress-service`, and their Postgres
DBs (`postgres-ai-tutor`, `postgres-memory-progress`). Their responsibilities — learner model,
progress, FSRS/review scheduling, mistakes, attempts, vocab, onboarding path generation,
grading, highlight content, real-time speaking — move entirely to the `agents/` stack
(primarily AGT-01, AGT-02, AGT-03, AGT-04, AGT-05, AGT-06, AGT-07).

This is a clean cut: each side owns full services end-to-end, including their own data. No
shared tables, no straddling — consistent with the project's existing
"services own their data, cross-service references by ID only" principle, just redrawing
which services exist on which side of the line.

### Decisions already made (don't relitigate)

1. **Spaced repetition algorithm**: keep AGT-07's existing **SM-2** implementation, not
   `ts-fsrs`/FSRS. The AI engineer owns this domain now; SM-2 is what's already built and
   tested there.
2. **Notification ownership**: `notification-service` (TS) remains the **only** caller of
   Novu. AGT-10 (Habit) stops calling Novu directly (`agt10_habit/novu.py`'s direct calls are
   removed) and instead **publishes a Kafka event** for `notification-service` to consume and
   act on — see §4.

## 3. What gets removed

- `services/ai-tutor-service/` — entire service, Dockerfile, Prisma schema/migrations, Kong
  routes.
- `services/memory-progress-service/` — entire service, Dockerfile, Prisma schema/migrations,
  Kong routes.
- `infra/docker-compose.yml`: `postgres-ai-tutor`, `postgres-memory-progress` and their
  volumes; the two services' container definitions.
- `gateway/kong/kong.yml`: routes currently pointing at `ai-tutor-service` /
  `memory-progress-service` (`/api/grading`, `/api/onboarding`, and the not-yet-built
  `/api/speaking/*`).
- `packages/shared/src/inference/` (the `LlmClient`/`SttClient`/`TtsClient` interfaces +
  mocks) — no longer needed in TS once `ai-tutor-service` is gone; the AI engineer's own
  `agents/shared/llm/router.py` is the inference layer now, internal to the Python stack.
- Kafka topics `attempt.recorded` and `speaking-session.analyzed` — both were
  producer-and-consumer entirely within the services being retired. They become
  Python-internal concerns (already mirrored by `agent.errors` / `agent.session.end`
  semantics) and are dropped from the cross-stack topic list.

## 4. Kafka — cross-stack topic contract

Topics that must continue crossing the TS ↔ Python boundary, with **producer ownership
moving** to the Python side where the producing responsibility moved:

| Topic | Producer (new) | Consumer | Shape | Notes |
|---|---|---|---|---|
| `user.upserted` | `user-service` (TS, unchanged) | `notification-service` (TS) | unchanged — `packages/shared/src/events/userUpserted.ts` | No change, stays fully TS-to-TS. |
| `learning-path.ready` | **AGT-02** (Learning Path), on plan generation/replan | `notification-service` (TS) | unchanged — `packages/shared/src/events/learningPathReady.ts` (`{eventId, userId, pathId, timestamp}`) | AI engineer publishes to this exact topic/shape from AGT-02 instead of `ai-tutor-service`. `pathId` = AGT-02's `plan_id`. |
| `achievement.unlocked` | **AGT-10** (Habit) — after it stops calling Novu directly | `notification-service` (TS) | unchanged — `packages/shared/src/events/achievementUnlocked.ts` (`{eventId, userId, achievementType, metadata, timestamp}`) | AGT-10 already receives milestone/streak signals (`agent.milestone.events` from AGT-01, its own habit logic) — it re-emits as this canonical event instead of calling Novu. |
| `review.due` (optional/low priority, as before) | **AGT-07** (Review) | `notification-service` (TS) | unchanged — `packages/shared/src/events/reviewDue.ts` | Same "optional" status as originally planned; only wire it if/when AGT-07 has a natural trigger point. |

All four keep the existing `BaseEvent` envelope (`eventId`, `schemaVersion`, `occurredAt`) from
`packages/shared/src/events/base.ts`. The Python side does **not** need to depend on the TS
`packages/shared` npm package — it just needs to produce JSON matching these shapes onto these
topic names. Recommend the AI engineer keep a small Python-side mirror of these event shapes
(e.g. `agents/shared/events/notification_events.py`) for consistency/testing.

Everything else already flowing through `agent.*` topics (`agent.errors`,
`agent.session.events`, `agent.session.end`, `agent.profile.deltas`, `agent.feedback.summary`,
`agent.pattern.events`, `agent.plan.events`, `agent.review.schedule`, `agent.milestone.events`,
`agent.consolidation.complete`) stays internal to the Python stack — TS never consumes these.

## 5. HTTP — cross-stack call contract

### 5a. `notification-service`'s scheduler and reminder context

`notification-service` currently calls `memory-progress-service`'s
`GET /internal/reminders/:userId/context` (via `src/lib/memoryProgressClient.ts`) from both
`dailyReminder.ts` and `vocabOfTheDay.ts` jobs, expecting a `ReminderContextDto`
(`{ dueReviewCount, vocabOfTheDay? }`).

Since `memory-progress-service` is retired, this needs a new home on the Python side:

- **Due review count** → natural home is **AGT-07** (Review/spaced-repetition) or **AGT-06**
  (LTM has session/error data but not scheduling state) — whichever agent ends up tracking
  due items under SM-2.
- **Vocab of the day** → **AGT-06**'s `GET /ltm/:userId/vocabulary` already returns vocabulary
  with `encounter_count` — needs a thin "pick today's word" endpoint, or `notification-service`
  picks deterministically from the existing list.

**Action required (AI engineer):** expose one internal endpoint, e.g.
`GET /internal/reminders/:userId/context` (same shape as today, `{dueReviewCount, vocabOfTheDay}`)
on whichever agent makes sense (AGT-06 or AGT-07), so `notification-service` only needs to
change its base URL/port in `memoryProgressClient.ts`, not its calling code.

### 5b. Curriculum access for AGT-02

AGT-02 (Learning Path) currently generates activities synthetically rather than from real
seeded content. It needs to call `learning-materials-service`'s existing public/internal API:

- `GET /catalog/summary` (already exists, `services/learning-materials-service/src/routes/internal.ts`) —
  digest of modules/lesson counts/exercise counts, same shape AI Tutor used to consume for
  path-gen prompts.
- `GET /modules`, `GET /modules/:id/lessons`, `GET /lessons/:id` (public, via Kong) for full
  content if needed beyond the summary.

**Action required (AI engineer):** AGT-02's plan generation should call one or both of these
instead of inventing activities, so plans reference real `moduleId`/`lessonId`/`exerciseId`
values the frontend can actually render/serve.

### 5c. Public API surface (frontend-facing, via Kong)

The frontend (`apps/web`) currently expects (per the original plan) `POST /api/onboarding` and
`POST /api/grading` as single synchronous endpoints. Neither maps 1:1 onto an existing AGT
endpoint today:

- **Onboarding** was: assessment/self-assessment → learner model → path generation → progress
  init → return path. On the agent side this spans **AGT-01** (`POST /profile/:userId`) +
  **AGT-02** (`POST /plans/:userId/generate`) as two separate calls today.
- **Grading** was: deterministic or LLM-graded exercise submission → feedback → async record.
  On the agent side this spans **AGT-04** (feedback/grammar) and/or **AGT-05** (CAT/IRT
  assessment), with no single "submit and grade" endpoint yet.

**Action required (AI engineer + frontend owner, joint decision):** either (a) add one thin
orchestration endpoint per flow on the Python side that internally calls the
profile/plan/feedback agents and returns a single response (preserves the existing frontend
contract), or (b) update the frontend integration contract to call AGT-01/02/04/05 directly as
separate steps. Recommend (a) to avoid forcing a frontend contract change as a side effect of
this backend split — but this needs explicit agreement with whoever owns `apps/web`, since it's
a separate, mostly-independent track.

### 5d. Kong routing changes

`gateway/kong/kong.yml` updates needed:

- Remove routes for `ai-tutor-service` and `memory-progress-service`.
- Add routes for whichever public-facing endpoints land per §5c (orchestration endpoints,
  ideally still under `/api/onboarding`, `/api/grading` to minimize frontend churn), pointing
  at the relevant `agt0x` container/port.
- Real-time speaking (`/api/speaking/session-ticket` + WS): never built in TS (Phase 6 was not
  started). This becomes fully a Python-side deliverable — AGT-03 already has
  `websocket_handler.py`; needs a ticket-issuance endpoint and a Kong route added when that
  flow is built out.
- `/internal/*` conventions stay docker-network-only, not routed through Kong, on both sides
  — unchanged convention.

## 6. Known gaps to flag (not blocking the split, but real)

- **TTS does not exist anywhere yet** — neither TS's mock `TtsClient` nor the Python stack has
  a real text-to-speech adapter (`agt03_tutor/pipeline.py` has only a comment placeholder).
  Needed before real-time speaking (8.2.4) can work end-to-end with audio output.
- **Maturity is uneven across agents.** AGT-01/02/03/06 have full test suites + validation
  runbooks (`docs/agt0{1,2,3,6}-*.md`). AGT-04/05/07/08/09/10/11 are scaffolds (170-530 lines,
  no `tests/` dir) — they'll need to reach the same bar (tests, runbooks) as they take on
  AI-Tutor/Memory-Progress responsibilities for real.
- **`INFERENCE_MODE` is still `mock` everywhere** in `infra/docker-compose.yml` for every
  `agt0x` service — no `GROQ_API_KEY`/`OPENROUTER_API_KEY` configured yet. Real model calls
  need these provisioned (AI engineer's responsibility) before "live" behavior is testable.
- **MinIO usage** (`pronunciation-audio`, `exercise-audio`, `writing-samples` buckets) is
  already provisioned in compose but unused by either stack — still deferred per the original
  plan (README §7.6 pronunciation feedback), no change here.

## 7. Migration sequencing

Recommended order, each step independently verifiable:

1. **Freeze new feature work** on `ai-tutor-service`/`memory-progress-service` — no further
   investment, they're being deleted.
2. **AI engineer**: build the two retargeting endpoints from §5a (reminder context) and the
   curriculum integration from §5b, plus the AGT-10 Novu→event change from §4. These can land
   without touching TS at all.
3. **TS**: update `notification-service`'s `memoryProgressClient.ts` (rename/retarget to the
   new agent base URL + port), add a Kafka consumer for `learning-path.ready` /
   `achievement.unlocked` events now originating from AGT-02/AGT-10 (consumer code mostly
   unchanged if the shape contract in §4 is honored — mainly a config/env change for which
   service is "the producer," nothing in the consumer logic should need to change).
4. **Joint**: settle §5c (onboarding/grading public contract) with the frontend owner, then
   build whichever orchestration endpoints were agreed, plus the matching Kong route changes.
5. **Delete** `services/ai-tutor-service`, `services/memory-progress-service`,
   `packages/shared/src/inference/`, their Postgres services/volumes in
   `infra/docker-compose.yml`, and their Kong routes.
6. **Update `CLAUDE.md`** "Current Status" and the service list once the cut is live — at that
   point the documented "5 backend services" becomes 3 TS + the `agents/` stack, and
   `docs/implementation-plan.md` Phases 6/7 (real-time speaking, offline sync) need owners
   reassigned (likely fully Python-side for speaking; offline sync TBD since it touches
   review/progress data that's moving to Python).

## 8. Acceptance criteria for "the merge is done"

- `docker compose up` brings up exactly: `postgres-user`, `postgres-learning-materials`,
  `postgres-notification`, `postgres-agents`, `redis`, `kafka`, `minio`, `kong`, `ollama`,
  `languagetool`, `user-service`, `learning-materials-service`, `notification-service`, and the
  11 `agt0x` services — no `ai-tutor-service`/`memory-progress-service`/their Postgres
  containers remain anywhere (compose file, Kong config, CI).
- A test event on `learning-path.ready` published from AGT-02 and `achievement.unlocked`
  published from AGT-10 are both correctly consumed by `notification-service` and trigger the
  expected Novu workflow — verified the same way Phase 5 was originally verified (real
  Kafka, not mocks).
- `notification-service`'s daily-reminder and vocab-of-the-day scheduler jobs successfully call
  the new agent-side reminder-context endpoint and produce the same dedup behavior
  (`ScheduledReminderRun`) as before.
- AGT-02-generated plans reference real `moduleId`/`lessonId`/`exerciseId` values that resolve
  against `learning-materials-service`'s seeded content.
- Whatever onboarding/grading public contract was agreed in §5c works end-to-end through Kong
  from a fresh user signup to a graded exercise attempt.
- `npm run -ws --if-present test` and `npm run -ws --if-present lint` pass at root with
  `ai-tutor-service`/`memory-progress-service` removed from the workspace list.

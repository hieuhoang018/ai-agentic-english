# AI Agentic English — Server-Side

This file is maintained across sessions. Update the **Current Status** section whenever a
phase/sub-step is completed or the plan changes — that section is the source of truth for
"where are we right now."

## What this project is

A PWA for English learning aimed at busy Vietnamese professionals, built around a multi-agent
AI architecture (onboarding/profiling, adaptive learning path, AI tutor/conversation, feedback,
assessment, memory, review generation, progress analysis, recommendation, habit-building,
translation). Full product spec (Vietnamese) is in `README.md`. This repo's active work is the
**server side** per `docs/implementation-plan.md` — the frontend (`apps/web`) is a separate,
mostly-independent track with its own `apps/web/CLAUDE.md`.

Key architectural decisions from the README (don't relitigate these without reason):

- **Self-hosted AI inference** (LLM/STT/TTS on GPU nodes) is a first-class architectural concern,
  not a deployment detail — but for this phase of work it's all mocked behind a swappable
  interface (`INFERENCE_MODE=mock|live`) until a separate AI engineer drops in real adapters.
- **5 backend services**, each owning its own Postgres DB, talking only by ID across services
  (no shared tables/FKs across service boundaries):
  - **User Service** — Clerk identity mirror (`clerkUserId`) + app settings. No passwords.
  - **Learning Materials Service** — immutable curriculum (modules/lessons/exercises/answer
    keys), assessment question bank, and `LearningPath` records (insert + supersede only, never
    mutated).
  - **Memory & Progress Service** — all dynamic learner state: learner model, progress, FSRS
    review schedule, mistakes, attempts, vocab/highlights.
  - **AI Tutor Service** — the only caller of the inference layer; orchestrates onboarding path
    generation, grading, highlight content, conversations, and real-time speaking.
  - **Notification Service** — reminder timing/content; Novu owns actual delivery.
- **API Gateway (Kong)** is the single entry point, except the real-time speaking WebSocket
  (deliberate hybrid-ingress exception: Kong issues a short-lived ticket, audio connects directly
  to AI Tutor).
- **Sync vs async discipline**: anything the user waits on is a synchronous REST call;
  persistence side-effects / SRS updates / notifications go through Kafka (async).
- **No RBAC yet**: a valid Clerk JWT = full access. Kong validates the JWT; services trust the
  forwarded identity claim and do not re-verify.
- **`/internal/*` routes** are service-to-service only, reachable via the docker-compose network,
  never routed through Kong.
- Canonical cross-service user reference is `clerkUserId` (string), used directly as the key in
  Memory & Progress, Learning Materials, and AI Tutor.

## Stack & conventions

- TypeScript + Node.js + Express + Prisma per service, own Postgres schema/DB, own Dockerfile.
- Vitest for tests; ESLint + Prettier from `packages/config` (`@ai-agentic-english/config`).
- `packages/shared` (`@ai-agentic-english/shared`) holds cross-service code: error types,
  `extractUserId`, DTOs, event definitions, inference client interfaces + mocks, Novu client
  interface, realtime protocol. Built via `tsup`/`tsc`, consumed as an npm workspace dependency.
- `ts-fsrs` npm package for spaced-repetition scheduling (not hand-rolled).
- Infra: `infra/docker-compose.yml` — 5x Postgres, Redis, Kafka (KRaft, no Zookeeper), MinIO,
  Kong (DB-less, declarative config in `gateway/kong/kong.yml`).
- Root scripts fan out across workspaces: `npm run dev|build|lint|format|test`.

Full phase-by-phase plan, deliverables, Kafka topic list, Redis key list, and
`packages/shared` directory layout: **`docs/implementation-plan.md`**. Read it before starting
work on a phase you haven't touched yet — this file only summarizes status, the plan doc has the
actual deliverable specs and exit criteria.

## Current Status

**Branch:** `server/phase3` · **Last updated:** 2026-06-17

| Phase | Scope | Status |
|---|---|---|
| 0 | Monorepo tooling + infra foundation (compose, Kong skeleton, 5 services scaffolded w/ `/health`) | ✅ Done |
| 1 | User Service + Clerk auth + Kong JWT | ✅ Done |
| 2 | Learning Materials Service (catalog, assessment, learning paths) | ✅ Done |
| 3 | Memory & Progress Service + inference interface contract | ✅ Done |
| 4 | AI Tutor: onboarding, grading, highlights | ⬜ Not started |
| 5 | Notification Service + Kafka event wiring | ⬜ Not started |
| 6 | Real-time speaking (WebSocket, cascaded STT/LLM/TTS) | ⬜ Not started |
| 7 | Offline sync endpoints | ⬜ Not started |

### Phase 3 deliverables (per implementation plan §Phase 3) — all done

1. Inference interface contract + mocks in `packages/shared/src/inference/`
   (`LlmClient`/`SttClient`/`TtsClient`, `Mock*` impls, `INFERENCE_MODE=mock|live` switch via
   `createLlmClient()`/`createSttClient()`/`createTtsClient()`; `live` throws until a real
   adapter lands).
2. `memory-progress-service` Prisma schema: `LearnerModel`, `Progress`, `ReviewSchedule`,
   `Mistake`, `Attempt`, `VocabItem` — migrated.
3. `ts-fsrs` integrated via `src/fsrs/scheduler.ts` (`createInitialReviewSchedule`,
   `applyReview`); unit-tested against reference scheduling values
   (`enable_short_term: false` — no minute-level relearning steps, since `ReviewSchedule`
   doesn't persist `learning_steps`).
4. Learner-model endpoints: `POST /internal/learner-models` (upsert, idempotent),
   `GET`/`PATCH /learner-models/:userId`.
5. `POST /internal/progress/:userId/initialize` (upsert; resets `completedExerciseIds` on
   every call, since re-init only happens when a superseded path replaces the old one).
6. `GET /exercises/next` — due `ReviewSchedule` rows first (earliest due), else
   `Progress.currentExerciseId`; calls Learning Materials' `/internal/exercises/:id` and
   strips `answerKey` before responding (first inter-service HTTP call in the repo — see
   `src/lib/learningMaterialsClient.ts`, `LEARNING_MATERIALS_SERVICE_URL`/`INTERNAL_SECRET`).
7. `attempt.recorded` consumer logic (`src/kafka/consumers/attemptRecorded.ts`) — deterministic
   `Attempt`/`Mistake`/`ReviewSchedule`(FSRS) updates from an event payload. **Not wired to a
   real Kafka topic** — no Kafka client exists anywhere in the repo yet; this is pure,
   directly-callable, fully unit-tested logic that Phase 4's actual consumer wiring (and AI
   Tutor's producer) will call. **Known gap**: does not advance
   `Progress.currentModuleId/LessonId/ExerciseId` to "what's next in the path" — that needs
   Learning Materials' path graph and was out of scope here; Phase 4 needs to close this.
8. `GET /review-center/highlights` — top mistakes by frequency (`Mistake.groupBy`) + due vocab
   (`ReviewSchedule` joined to `VocabItem`); content generation stubbed via
   `src/lib/highlightContentGenerator.ts` (`createStubHighlightContentGenerator`) until AI
   Tutor's real `POST /internal/highlights/generate-content` exists in Phase 4.
9. Offline DTO shapes only (`packages/shared/src/dto/offline.ts`): `OfflinePackageDto`,
   `OfflineSyncRequestDto`, `OfflineSyncResultDto` — no routes/`OfflineReviewLog` table yet
   (Phase 7).

Shared `ErrorCategory` enum (`vocab`/`grammar`/`pronunciation`/`fluency`/`coherence`) landed in
`packages/shared/src/dto/memory-progress.ts`, used by both Memory & Progress and the inference
contract. Event envelope (`BaseEvent`) and `AttemptRecordedEvent` landed in
`packages/shared/src/events/`.

64 tests passing (25 `packages/shared`, 39 `memory-progress-service`), lint clean. Manually
verified end-to-end against the real Docker containers + Postgres (not just unit tests):
learner-model CRUD, progress-initialize, exercises/next's both selection branches (path vs. due
review, confirmed by backdating a `due` row), and review-center highlights — see chat history
for the exact `curl`/script sequence if reproducing.

**Docker containers do not hot-reload** — `Dockerfile`s `COPY . .` at build time, no bind mounts.
After changing service code, `docker compose build <service> && docker compose up -d <service>`
(add `--no-cache` if you suspect a stale layer) before testing through the container; `npm run
dev` on the host picks up changes immediately and is the faster inner loop.

### Notes on what's already in place (useful when extending)

- `packages/shared/src/events/eventBus.ts`: `EventBus` interface + `InMemoryEventBus` (records
  published events in memory) — real Kafka producer wiring per-service still pending; services so
  far only stub-publish via this in-memory bus.
- `packages/shared/src/errors/`, `auth/extractUserId.ts`, `dto/user.ts`,
  `dto/learning-materials.ts`, `dto/memory-progress.ts`, `dto/offline.ts`,
  `events/base.ts`, `events/attemptRecorded.ts`, `http/asyncHandler.ts`, `http/internal.ts`,
  `inference/`, `testing/` already exist and are reused across services — check here before
  adding new cross-cutting code.
- `user-service` and `learning-materials-service` are the reference implementations for
  patterns (Prisma client isolation per service, `/internal/*` route convention, seed scripts,
  mappers, Kong wiring) — `memory-progress-service` now follows the same patterns too.
- Kong config lives in `gateway/kong/kong.yml`; only has a `/api/health/memory-progress-service`
  route so far — none of Phase 3's new endpoints are routed through Kong yet (tested directly
  against the service's own port; Kong wiring wasn't called for in the Phase 3 plan).
  `gateway/kong/scripts/jwks-to-pem.mjs` converts Clerk JWKS for Kong's JWT plugin.

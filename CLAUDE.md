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

- **Self-hosted AI inference** (LLM/STT/TTS on local/on-prem GPU hardware — not a third-party
  cloud API) is a first-class architectural concern, not a deployment detail — but for Phases
  0-7 it's all mocked behind a swappable interface (`INFERENCE_MODE=mock|live`). A separate AI
  engineer drops in real adapters in **Phase 8** (not yet scheduled), reachable like another
  internal service (docker-compose network / local host+port) rather than over the public
  internet — no third-party auth/secrets to manage for it.
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

**Branch:** `server/phase5` · **Last updated:** 2026-06-18

| Phase | Scope | Status |
|---|---|---|
| 0 | Monorepo tooling + infra foundation (compose, Kong skeleton, 5 services scaffolded w/ `/health`) | ✅ Done |
| 1 | User Service + Clerk auth + Kong JWT | ✅ Done |
| 2 | Learning Materials Service (catalog, assessment, learning paths) | ✅ Done |
| 3 | Memory & Progress Service + inference interface contract | ✅ Done |
| 4 | AI Tutor: onboarding, grading, highlights | ✅ Done |
| 5 | Notification Service + Kafka event wiring | ✅ Done |
| 6 | Real-time speaking (WebSocket, cascaded STT/LLM/TTS) | ⬜ Not started |
| 7 | Offline sync endpoints | ⬜ Not started |
| 8 | Live AI inference integration (real local GPU LLM/STT/TTS adapters, owned by AI engineer) | ⬜ Not scheduled |

Phases 0-3 summary: tooling/infra scaffolded, User Service (Clerk auth + Kong JWT), Learning
Materials Service (catalog/assessment/learning-paths), Memory & Progress Service (learner model,
progress, FSRS review schedule, `attempt.recorded` consumer logic, review-center highlights) +
the inference interface contract (`LlmClient`/`SttClient`/`TtsClient` + mocks) in
`packages/shared`. See git history / prior implementation-plan.md phases for detail.

### Phase 4 deliverables (per implementation plan §Phase 4) — all done

Per README §8.2.1, onboarding's public entry point is **Memory & Progress Service**, not AI
Tutor — the client posts there, it upserts the `LearnerModel`, then calls AI Tutor's internal
`generate-path` endpoint, which reads the catalog, calls the LLM, writes the path to Learning
Materials, and initializes progress back in Memory & Progress.

1. `ai-tutor-service` Prisma: `Conversation`/`Message` added (per plan), unused until Phase 6.
2. Deterministic grading module (`ai-tutor-service/src/grading/`): one pure function per
   exercise type (`mcq`, `fill-blank`, `sentence-correction`, `listening-comprehension`), all
   normalizing and comparing against the seeded `answerKey: { answer: string }` shape;
   `gradeDeterministic()` dispatch returns `null` for an unrecognized type — that's the fallback
   path to `LlmClient.gradeOpenResponse` (every currently-seeded type is objective, so the LLM
   path is only reachable for a future open-ended type).
3. `POST /grading/submit` (`ai-tutor-service`, public via Kong `/api/grading`, `requireAuth`):
   grades synchronously, responds immediately, then publishes `attempt.recorded` via the
   injected `EventBus` (still `InMemoryEventBus` — no real Kafka client exists anywhere in the
   repo yet, consistent with every other event so far).
4. `POST /internal/onboarding/generate-path` (`ai-tutor-service`): catalog summary →
   `LlmClient.generateLearningPath` → `learningMaterialsClient.createLearningPath` → derives the
   first `{moduleId, lessonId, exerciseId}` from the returned path → `memoryProgressClient.
   initializeProgress` → returns the `LearningPathDto`.
5. `POST /internal/highlights/generate-content` (`ai-tutor-service`): Redis-cached
   (`highlight-content:<userId>:<sha256(input)>`, TTL 24h) wrapper around
   `LlmClient.generateHighlightContent` — `src/lib/redisCache.ts` (`createRedisCacheClient` /
   `createInMemoryCacheClient` for tests, same DI pattern as `InMemoryEventBus`).
6. `POST /onboarding` (`memory-progress-service`, public via Kong `/api/onboarding`,
   `requireAuth`): upserts `LearnerModel` (shared helper `src/lib/learnerModel.ts`, also used by
   `/internal/learner-models`), calls AI Tutor via the new `src/lib/aiTutorClient.ts`, returns
   the generated `LearningPathDto` directly.
7. `memory-progress-service`'s `/review-center/highlights` now calls AI Tutor's real endpoint
   (`createAiTutorHighlightContentGenerator`) instead of the Phase 3 stub (stub kept for tests).
8. Closed a Phase 3 gap: `attemptRecorded` consumer now advances
   `Progress.currentModuleId/LessonId/ExerciseId` to the next item in the path on a correct
   attempt, via a new pure `src/lib/pathProgression.ts` (`getNextPosition`) and a new Learning
   Materials internal endpoint `GET /internal/learning-paths/:id`.

All three flows (onboarding, grading, highlight generation incl. cache-hit) were manually
verified end-to-end against real Docker Postgres/Redis + live inter-service HTTP calls, not just
unit tests — see chat history for the exact `curl`/script sequence if reproducing. 139 tests
passing across all 6 backend workspaces, lint clean (the one lint failure is a pre-existing
`apps/web` Next.js warning, unrelated to this work).

### Phase 5 deliverables (per implementation plan §Phase 5) — all done

Real `kafkajs` producer/consumer wiring replaced the `InMemoryEventBus` *default* everywhere
(tests still inject `InMemoryEventBus` explicitly — same DI pattern as before, only the
production default changed), plus the Notification Service itself.

1. `packages/shared/src/events/kafkaEventBus.ts` (`createKafkaEventBus`, lazy-connect producer)
   and `kafkaConsumer.ts` (`createKafkaConsumer`, generic consumer-group runner) — first real
   Kafka client code in the repo. New event schemas: `userUpserted.ts`, `learningPathReady.ts`,
   `achievementUnlocked.ts`, `reviewDue.ts`. `packages/shared/src/notifications/novuClient.ts`:
   `NovuClient` interface + `MockNovuClient` (real adapter deferred — no sandbox account yet,
   same swappable pattern as `INFERENCE_MODE`).
2. Producers retrofitted: `user-service` publishes `user.upserted` (additive, alongside the
   existing `user.created`/`user.updated`) after the Clerk webhook upsert; `ai-tutor-service`
   publishes `learning-path.ready` after onboarding path generation;
   `memory-progress-service`'s `attemptRecorded` consumer now publishes `achievement.unlocked`
   for two of the three planned achievements — see point 4.
3. Closed two long-standing gaps the consumers/scheduler needed to be meaningful:
   `memory-progress-service`'s `attempt.recorded` consumer was previously dead code (only
   invoked by its own test) — `src/kafka/bootstrap.ts` now runs a real consumer group, started
   from `index.ts`. `GET /internal/reminders/:userId/context` (a Phase 3 deliverable that was
   never built) now exists in `memory-progress-service`, and `user-service` gained
   `GET /internal/users` (new for that service) so the notification scheduler can enumerate
   users + settings.
4. Achievement detection added to `consumeAttemptRecorded`
   (`memory-progress-service/src/kafka/consumers/attemptRecorded.ts`): `first-lesson` (new
   `Progress.firstLessonCompletedAt`, fires the first time path progression crosses into a new
   lesson) and `7-day-streak` (new `LearnerModel.currentStreakDays`/`lastActivityDate`, calendar-day
   diffing). `level-up` is intentionally not implemented — nothing in the codebase mutates
   `LearnerModel.currentLevel` from attempt processing yet, so there's no real trigger for it;
   flagged rather than faked.
5. `notification-service` (previously just a `/health` scaffold): Prisma `ProcessedEvent`
   (eventId dedup) + `ScheduledReminderRun` (userId+reminderType+runDate dedup);
   `src/kafka/consumers/*.ts` (one pure handler per topic, dedup via `ProcessedEvent` then a
   `NovuClient` call) + `src/kafka/bootstrap.ts` (one consumer group, all 4 topics, dispatches by
   topic); `src/lib/userServiceClient.ts` / `memoryProgressClient.ts` (internal HTTP clients,
   same `x-internal-secret` pattern as every other internal client); `src/scheduler/{dailyReminder,
   vocabOfTheDay}.ts` (`node-cron`, hourly, per-user IANA-timezone time-of-day match against
   `UserSettings.reminderTime`, deduped via `ScheduledReminderRun`).
6. `review.due` (topic + consumer) is defined but has no producer wired — the plan marks it
   "(optional)/low priority" and no existing call site justified one without overbuilding.
   Documented as a deliberate gap, not a miss.

Verified for real: brought up the actual `infra/docker-compose.yml` Postgres/Kafka containers,
ran the new Prisma migrations against them, and round-tripped a real `user.upserted` event
through `kafkajs` end-to-end — published via `createKafkaEventBus`, consumed by
`notification-service`'s real consumer group, deduped correctly against the real
`ProcessedEvent` table on redelivery. Also confirmed `memory-progress-service`'s
`attempt.recorded` consumer group joins cleanly against the real broker. 164 tests passing
across all 6 backend workspaces, lint clean (same pre-existing unrelated `apps/web` warning).

**Kafka has a host-accessible listener now** — `infra/docker-compose.yml`'s `kafka` service
advertises two listeners: `PLAINTEXT://kafka:9092` for container-to-container traffic (used by
every service's compose `KAFKA_BROKERS` env) and `HOST://localhost:9094` for `npm run dev` on
the host machine (used by every service's `.env.example`). This didn't matter before Phase 5
because nothing actually connected to Kafka; without it, a host-side process trying to reach
`kafka:9092` fails since that hostname only resolves inside the compose network.

**Docker containers do not hot-reload** — `Dockerfile`s `COPY . .` at build time, no bind mounts.
After changing service code, `docker compose build <service> && docker compose up -d <service>`
(add `--no-cache` if you suspect a stale layer) before testing through the container; `npm run
dev` on the host picks up changes immediately and is the faster inner loop.

### Notes on what's already in place (useful when extending)

- `packages/shared/src/events/eventBus.ts`: `EventBus` interface + `InMemoryEventBus` (test-only
  now — every service's `createApp`/bootstrap defaults to `createKafkaEventBus` in production,
  same as Redis's `createRedisCacheClient`/`createInMemoryCacheClient` split). Real topics must
  exist on the broker before a consumer subscribes (`kafka-topics.sh --create`, or just publish
  once if the broker has `auto.create.topics.enable` on) — see the manual verification note above
  if topics seem to vanish: the `kafka` container has no persistent volume, so a recreate wipes
  them.
- `ai-tutor-service/src/lib/redisCache.ts` is the first real Redis usage in the repo
  (`createRedisCacheClient` using the `redis` npm package, `createInMemoryCacheClient` for
  tests) — reuse this pattern rather than adding another Redis client lib.
- `packages/shared/src/errors/`, `auth/extractUserId.ts`, `dto/*`, `events/*`,
  `http/asyncHandler.ts`, `http/internal.ts`, `inference/`, `testing/` already exist and are
  reused across services — check here before adding new cross-cutting code.
- `user-service` and `learning-materials-service` are the reference implementations for
  patterns (Prisma client isolation per service, `/internal/*` route convention, seed scripts,
  mappers, Kong wiring); `memory-progress-service` and `ai-tutor-service` now follow the same
  patterns, including the multi-arg `createApp(prisma, ...clients)` DI shape for test injection.
- Kong config lives in `gateway/kong/kong.yml`; routes now exist for `/api/grading` (→ AI Tutor)
  and `/api/onboarding` (→ Memory & Progress), in addition to the Phase 1-2 routes and per-service
  `/api/health/*`. AI Tutor's `/internal/*` and Memory & Progress's `/internal/*` are still
  docker-network-only, never through Kong. `gateway/kong/scripts/jwks-to-pem.mjs` converts Clerk
  JWKS for Kong's JWT plugin.

# AI Agentic English — Server-Side Implementation Plan

## Context

The repo currently has only a folder skeleton (per-package `package.json` + `README.md` stubs under `apps/web`, `services/*`, `packages/shared`, `gateway/kong`, `infra`, `docs`) created from the architecture described in the root `README.md`. No real code exists yet.

This plan lays out how to build everything **except `apps/web`** (the frontend): the 5 backend services (User, Learning Materials, Memory & Progress, AI Tutor, Notification), `packages/shared`, the Kong gateway config, and local infrastructure (Postgres x5, Redis, Kafka, MinIO, Kong via docker-compose).

Goal: a series of dependency-ordered phases, each producing a runnable, testable increment, ending with all server-side flows from root `README.md` section 8 working end-to-end against mock AI inference (LLM/STT/TTS — the real models are owned by a separate AI engineer and will later be dropped in behind the same interface).

---

## Decisions made during planning

- **Build order**: dependency-ordered, service-by-service (not vertical slices).
- **AI inference**: define a swappable `LlmClient` / `SttClient` / `TtsClient` interface in `packages/shared` now, backed by mock implementations (`INFERENCE_MODE=mock|live`). AI engineer implements real adapters later behind the same contract.
- **Infra**: all infrastructure (5x Postgres, Redis, Kafka, MinIO, Kong) stood up upfront in Phase 0 via docker-compose, so every later phase runs against real infra.
- **Tooling**: TypeScript + Node.js + Express + Prisma per service; Vitest for tests; ESLint + Prettier from a shared `packages/config`.
- **Canonical user ID**: `clerkUserId` (string) is the universal cross-service user reference (Memory & Progress, Learning Materials, AI Tutor all key learner data on it directly).
- **Internal endpoints**: `/internal/*` routes are service-to-service only, reachable via the docker-compose network by service hostname — never routed through Kong. This convention is used by every service from Phase 2 onward.
- **Trust boundary**: Kong validates the Clerk JWT (via JWKS); services trust a forwarded identity claim and do not re-verify. Matches the README's "no RBAC yet, valid token = full access" stance.
- **Clerk & Novu**: real/sandbox accounts will be available — Phases 1 and 5 wire real integrations directly (JWKS, webhooks, Novu API), not mock-only.
- **FSRS**: use the `ts-fsrs` npm package for spaced-repetition scheduling rather than a hand-rolled implementation.
- **New Kafka events** (additions beyond the README, needed to satisfy stated requirements without violating data ownership): `user.upserted` (User Service → Notification Service, for Novu subscriber sync) and `speaking-session.analyzed` (AI Tutor → Memory & Progress).
- **Achievements**: small initial set — first lesson completed, 7-day streak, CEFR level-up — extensible later.
- **MinIO / per-turn audio storage** in the speaking feature: deferred entirely (not part of Phase 6); revisit when pronunciation feedback (README 7.6) is built. MinIO buckets can still be provisioned in Phase 0 infra for future use, but no service writes to them yet.
- **Realtime ticket issuance**: Kong (DB-less/declarative) validates the JWT and routes the ticket request to an AI Tutor endpoint that performs issuance (stores ticket in Redis); Kong's role is auth + routing, not custom logic.
- **WebSocket protocol** (speaking feature): JSON envelope for control messages (`{type: "end_session"}`, `{type: "turn_complete"}`, etc.) plus binary frames for audio data — defined in `packages/shared/src/realtime/protocol.ts`. Frontend (out of scope here) must match this contract.

---

## Guiding principles carried through every phase

- Services own their data; cross-service references are by ID only.
- Sync vs async discipline: anything the user is waiting on is a synchronous REST call; persistence/SRS/notifications are async via Kafka.
- Every service: Node.js + Express + TypeScript + Prisma, own Postgres schema/DB, own Dockerfile, Vitest tests, ESLint+Prettier from shared config.
- AI Tutor Service is the only caller of the inference layer, via the swappable `InferenceClient` interfaces.

---

## Phase 0 — Monorepo Tooling & Infrastructure Foundation

**Exit criteria**: `npm install` works across workspaces; `docker compose up` in `infra/` brings up 5x Postgres (one per service), Redis, Kafka (KRaft, no Zookeeper), MinIO, Kong (DB-less); each of the 5 services has a `/health` endpoint connecting to its own Postgres via Prisma; Kong routes `/api/health/<service>` to each; root `npm run lint|test|build` work across all workspaces.

**Deliverables**:
- `packages/config`: `@ai-agentic-english/config` with `tsconfig.base.json`, ESLint flat config, Prettier config, Vitest base config.
- `packages/shared`: skeleton package (buildable, exports placeholder), with `tsconfig.json` + build via `tsup`/`tsc`.
- `infra/docker-compose.yml`: `postgres-user`, `postgres-learning-materials`, `postgres-memory-progress`, `postgres-ai-tutor`, `postgres-notification` (separate volumes/DBs/ports), `redis`, `kafka` (KRaft single-node), `minio` + one-shot `mc` init container creating `audio`/`attachments` buckets, `kong` (DB-less, declarative config from `gateway/kong/kong.yml`). Plus `infra/.env.example`.
- `gateway/kong/kong.yml`: declarative skeleton — services + routes for each of the 5 backend services, no auth yet.
- Per service (`user-service`, `learning-materials-service`, `memory-progress-service`, `ai-tutor-service`, `notification-service`): `src/index.ts` (Express bootstrap + `/health`), `src/app.ts` (app factory), `prisma/schema.prisma` (datasource/generator only), `.env.example`, `Dockerfile`, `tsconfig.json` extending `packages/config`, `vitest.config.ts`, a trivial health-check test.
- Root `package.json` scripts (`dev`, `build`, `lint`, `format`, `test` fanning out via `npm run -ws --if-present`), root ESLint/Prettier/tsconfig referencing `packages/config`.

**Sub-steps**: 1) root tooling (`packages/config`, root scripts) → 2) `packages/shared` skeleton → 3) docker-compose for Postgres x5/Redis/Kafka/MinIO, verify healthy → 4) add Kong with routing-only `kong.yml` → 5) scaffold each service (Express `/health` + Prisma datasource, run `prisma migrate dev` against compose Postgres) → 6) wire Vitest + trivial test per service → 7) verify MinIO bucket creation via `mc` init container → 8) document dev quickstart in `infra/README.md` and root `README.md`.

**Critical files**: `infra/docker-compose.yml`, `gateway/kong/kong.yml`, `packages/config/*`, each `services/*/prisma/schema.prisma` and `services/*/src/index.ts`.

---

## Phase 1 — User Service + Clerk Auth + Kong JWT (Foundation)

**Exit criteria**: Clerk webhook upserts `User` by `clerkUserId`; Kong validates JWT via Clerk JWKS on all `/api/*` routes except `/health` and `/webhooks/*`; authenticated requests reach services with `clerkUserId` resolvable from the forwarded JWT; settings CRUD implemented (8.1 complete); tests cover webhook idempotency, settings round-trip, and Kong rejecting missing/invalid tokens.

**Deliverables**:
- Prisma (`user-service`): `User` (`id`, `clerkUserId` unique, `email`, `name`, timestamps), `UserSettings` (`userId` 1:1, `dailyTimeBudgetMinutes`, `preferredLanguage`, `reminderTime`, `timezone`, `notificationChannelHints` jsonb).
- Endpoints: `POST /webhooks/clerk` (Svix-verified, upserts on user.created/updated/deleted), `GET /users/me`, `PATCH /users/me/settings`, `GET /health`.
- Kong: JWT/OIDC plugin against Clerk JWKS on `/api/*`; `/webhooks/*` bypasses JWT (Svix signature is its own auth); Kong forwards `Authorization` header through, services use a shared middleware to decode (not re-verify) `sub`.
- `packages/shared`: `src/auth/extractUserId.ts`, `src/errors/` (`AppError`, `NotFoundError`, `ValidationError`, `UnauthorizedError`), `src/dto/user.ts` (`UserDto`, `UserSettingsDto`).

**Sub-steps**: 1) shared error types + `extractUserId` → 2) Prisma schema/migration → 3) `/webhooks/clerk` with Svix verification + tests → 4) `/users/me` GET/PATCH → 5) configure Kong JWT/OIDC against Clerk JWKS (`CLERK_JWKS_URL`, `CLERK_ISSUER`) → 6) integration test: no token → 401 at gateway, valid token → reaches service with `clerkUserId` → 7) update `.env.example` with `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `CLERK_JWKS_URL`, `CLERK_ISSUER`.

**Depends on**: Phase 0.

**Critical files**: `services/user-service/prisma/schema.prisma`, `services/user-service/src/routes/webhooks.ts`, `gateway/kong/kong.yml`, `packages/shared/src/auth/extractUserId.ts`.

---

## Phase 2 — Learning Materials Service (independent, content + assessment)

**Exit criteria**: curriculum CRUD (modules/lessons/exercises incl. answer keys) seedable; assessment module with deterministic scoring; learning paths stored as immutable records (insert + supersede only); seed script populates ~2-3 modules / ~10 lessons / ~30 exercises across all 4 skills; tests cover catalog reads, assessment scoring determinism, and path immutability.

**Deliverables**:
- Prisma: `Module` (`id`, `title`, `description`, `cefrLevel`, `skillFocus`, `order`), `Lesson` (`moduleId`, `title`, `content` jsonb, `order`), `Exercise` (`lessonId`, `type`, `prompt` jsonb, `answerKey` jsonb, `difficulty`, `skill`), `LearningPath` (`userId`=clerkUserId, `version`, `status` active/superseded, `generatedAt`, `pathDefinition` jsonb — immutable, insert-only), `AssessmentQuestion` (`skill`, `cefrLevelTarget`, `prompt` jsonb, `correctAnswer` jsonb, `order`).
- Public endpoints (via Kong): `GET /modules`, `GET /modules/:id`, `GET /modules/:id/lessons`, `GET /lessons/:id`, `GET /exercises/:id` (no `answerKey`), `GET /assessment/questions`, `POST /assessment/score`, `GET /learning-paths/:userId/active`.
- Internal endpoints (docker network only): `GET /internal/exercises/:id` (incl. `answerKey`), `POST /internal/learning-paths` (insert + supersede prior active path), `GET /catalog/summary` (digest for AI Tutor's path-gen prompt).
- Seed script: `services/learning-materials-service/prisma/seed.ts`, idempotent.
- `packages/shared`: `src/dto/learning-materials.ts` (`ModuleDto`, `LessonDto`, `ExerciseDto`, `ExerciseInternalDto`, `LearningPathDto`, `AssessmentQuestionDto`, `AssessmentResultDto`), `src/ids.ts` additions (`ModuleId`, `LessonId`, `ExerciseId`, `LearningPathId`).

**Sub-steps**: 1) Prisma schema/migration for Module/Lesson/Exercise → 2) seed script across 4 skills + a couple CEFR levels → 3) public catalog endpoints → 4) `AssessmentQuestion` schema + seed + `/assessment/questions` + `/assessment/score` (heavily unit-tested deterministic scoring) → 5) `LearningPath` schema + `/internal/learning-paths` (immutability/supersede) + `GET /learning-paths/:userId/active` → 6) `/internal/exercises/:id` with answer key, internal-route convention applied → 7) `/catalog/summary`.

**Depends on**: Phase 0 only (no cross-service calls).

**Critical files**: `services/learning-materials-service/prisma/schema.prisma`, `services/learning-materials-service/prisma/seed.ts`, `services/learning-materials-service/src/routes/*.ts`, `packages/shared/src/dto/learning-materials.ts`.

---

## Phase 3 — Memory & Progress Service (core dynamic state) + Inference Interface Contract

**Exit criteria**: learner model creatable from onboarding inputs; progress + FSRS schedule storage and deterministic "next exercise/review" selection; mistakes store + deterministic highlight-item selection (content generation deferred to Phase 4); inference interface contract defined in `packages/shared`; tests cover FSRS scheduling (via `ts-fsrs`), next-exercise selection, and highlight selection.

**Deliverables**:
- Prisma: `LearnerModel` (`userId` PK = clerkUserId, `currentLevel` per-skill jsonb, `dailyTimeBudgetMinutes`, `goals` jsonb, `weakAreas` jsonb), `Progress` (`userId`, `pathId`, `currentModuleId/LessonId/ExerciseId`, `completedExerciseIds`), `ReviewSchedule` (FSRS state per item: `userId`, `itemId`, `itemType`, `due`, `stability`, `difficulty`, `lastReviewedAt`, `reps`, `lapses`, `state`), `Mistake` (`userId`, `exerciseId`, `attemptId`, `errorCategory`, `errorLabel`, `detail` jsonb), `Attempt` (`userId`, `exerciseId`, `submittedAnswer`, `isCorrect`/`score`, `feedback`, `gradedBy`), `VocabItem` (`userId`, `term`, `meaning`, `exampleSentence`, `sourceExerciseId`).
- Endpoints: `POST /internal/learner-models` (onboarding), `GET/PATCH /learner-models/:userId`, `POST /internal/progress/:userId/initialize`, `GET /exercises/next` (deterministic next-item selection: due reviews first, then path progression — fetches content from Learning Materials internal API), `GET /review-center/highlights` (deterministic selection; content-generation call to AI Tutor stubbed for now), `GET /reminders/:userId/context` (used by Notification Service in Phase 5). Define (shapes only) `GET /offline-package` / `POST /offline-sync` for forward-compatibility with Phase 7.
- Kafka consumer: `attempt.recorded` topic (defined now, producer comes in Phase 4) → deterministic Progress/ReviewSchedule(FSRS)/Mistake update.
- **Inference interface contract** (`packages/shared/src/inference/`): `LlmClient` (`generateLearningPath`, `gradeOpenResponse`, `generateHighlightContent`, `tutorReply`, `analyzeSessionTranscript`), `SttClient.transcribeAudio`, `TtsClient.synthesizeSpeech` — all DTOs in `types.ts`; `MockLlmClient`/`MockSttClient`/`MockTtsClient` with deterministic canned responses in `mocks/`; `INFERENCE_MODE=mock|live` config switch.
- Shared `errorCategory` enum (vocab/grammar/pronunciation/fluency/coherence) defined in `packages/shared`, used by both Memory & Progress and AI Tutor.

**Sub-steps**: 1) inference interface contract + mocks in `packages/shared` (unblocks Phase 4) → 2) Prisma schema/migration → 3) integrate `ts-fsrs`, unit-test scheduling against reference values → 4) learner-model endpoints → 5) progress-initialize endpoint → 6) `GET /exercises/next` → 7) `attempt.recorded` Kafka consumer (topic defined now) → 8) `GET /review-center/highlights` (selection only, AI Tutor call stubbed) → 9) define offline endpoint DTOs/shapes only.

**Depends on**: Phase 1 (auth/userId convention), Phase 2 (Learning Materials internal API for exercise content).

**Critical files**: `packages/shared/src/inference/types.ts` & `mocks/*.ts`, `services/memory-progress-service/prisma/schema.prisma`, `services/memory-progress-service/src/fsrs/*.ts`, `services/memory-progress-service/src/routes/exercises.ts`.

---

## Phase 4 — AI Tutor Service: Onboarding, Grading, Highlights (sync flows, no realtime yet)

**Exit criteria**: 8.2.1 onboarding works end-to-end against mock LLM (assessment/self-assessment → learner model → sync path generation → path stored in Learning Materials → progress initialized → path returned); 8.2.2 exercise attempt works (next exercise served, objective grading deterministic, open-ended via mock LLM, feedback sync, attempt recorded async via Kafka); 8.2.3b highlight content generation works with Redis caching; integration tests cover all three flows end-to-end.

**Deliverables**:
- Prisma (`ai-tutor-service`): `Conversation` (`userId`, `type`, timestamps), `Message` (`conversationId`, `role`, `content`) — minimal here, expanded in Phase 6.
- Endpoints: `POST /onboarding/generate-path` (internal; reads catalog from Learning Materials, calls `LlmClient.generateLearningPath`, writes path + initializes progress), `POST /grading/submit` (public via Kong; deterministic grading for objective types, `LlmClient.gradeOpenResponse` for open-ended; publishes `attempt.recorded` after responding), `POST /internal/highlights/generate-content` (calls `LlmClient.generateHighlightContent`, Redis-cached).
- Memory & Progress wiring: onboarding endpoint now calls `POST /onboarding/generate-path` synchronously; `GET /review-center/highlights` now calls `POST /internal/highlights/generate-content`.
- Kafka producer: `attempt.recorded` — `{eventId, userId, exerciseId, attemptId, isCorrect, score, errorLabels[], gradedBy, timestamp}`.
- Deterministic grading module (`services/ai-tutor-service/src/grading/`): pure functions per exercise type (mcq, fill-blank, sentence-correction, listening-comprehension), unit-tested independently.
- Redis: `highlight-content:<userId>:<contentHash>` (TTL 24h), `catalog-summary` (TTL ~1h).

**Sub-steps**: 1) `LlmClient` mock wiring (`INFERENCE_MODE=mock`) → 2) deterministic grading module + unit tests → 3) `POST /grading/submit` + Kafka producer → 4) Memory & Progress's `attempt.recorded` consumer fully implemented + e2e test → 5) `POST /onboarding/generate-path` (mock `generateLearningPath` designed to produce a plausible path from the Phase 2 seeded curriculum) + wire onboarding → 6) e2e onboarding test → 7) `POST /internal/highlights/generate-content` + Redis caching, wire `/review-center/highlights` → 8) e2e highlight test incl. cache-hit assertion.

**Depends on**: Phase 2, Phase 3.

**Critical files**: `services/ai-tutor-service/src/grading/*.ts`, `services/ai-tutor-service/src/routes/onboarding.ts`, `services/ai-tutor-service/src/routes/grading.ts`, `services/memory-progress-service/src/kafka/consumers/attemptRecorded.ts`, `packages/shared/src/events/attemptRecorded.ts`.

---

## Phase 5 — Notification Service + Kafka Event Wiring

**Exit criteria**: all business events in the Kafka topic list are published; Notification Service consumes them and triggers Novu (real sandbox account); scheduler fires daily-reminder + vocab-of-day jobs reading `/reminders/:userId/context`; subscriber sync to Novu via `user.upserted`; tests cover both event-driven and schedule-driven paths.

**Deliverables**:
- Prisma (`notification-service`, minimal): `ProcessedEvent` (`eventId` PK, `processedAt` — Kafka at-least-once dedup), `ScheduledReminderRun` (`userId`, `reminderType`, `runDate`, `sentAt` — prevents double-sends).
- Kafka consumers: `learning-path.ready`, `achievement.unlocked`, `review.due` (lower priority/optional), `user.upserted` (subscriber sync).
- Kafka producers (retrofits): AI Tutor publishes `learning-path.ready` after onboarding; Memory & Progress's `attempt.recorded` consumer extended to detect achievements (first lesson, 7-day streak, level-up) and publish `achievement.unlocked`; User Service publishes `user.upserted` after webhook upsert.
- `packages/shared/src/notifications/novuClient.ts`: `NovuClient` interface (`upsertSubscriber`, `triggerNotification`) + `MockNovuClient` for tests.
- Scheduler (`services/notification-service/src/scheduler/`): `node-cron`-based `dailyReminder` and `vocabOfTheDay` jobs, dedup via `ScheduledReminderRun`.

**Sub-steps**: 1) define all remaining Kafka event schemas in `packages/shared/src/events/` → 2) `NovuClient` (real) + `MockNovuClient` for tests; `user.upserted` consumer → Novu subscriber sync → 3) consumers for `learning-path.ready` / `achievement.unlocked` / `review.due` → Novu triggers → 4) retrofit AI Tutor to publish `learning-path.ready` → 5) retrofit Memory & Progress attempt-consumer for achievements → 6) scheduler jobs + dedup → 7) e2e tests for both paths.

**Depends on**: Phase 1 (User Service, settings/timezone), Phase 3 (`/reminders/:userId/context`), Phase 4 (event publishing pattern).

**Critical files**: `packages/shared/src/events/*.ts`, `services/notification-service/src/kafka/consumers/*.ts`, `services/notification-service/src/scheduler/*.ts`, `packages/shared/src/notifications/novuClient.ts`, `services/user-service/src/kafka/producers/userUpserted.ts`.

---

## Phase 6 — Real-Time Speaking (most complex, built last among core flows)

**Exit criteria**: 8.2.4 works against mock STT/TTS/LLM end-to-end — Kong validates JWT and routes to AI Tutor's ticket-issuing endpoint → client opens WebSocket directly to AI Tutor with ticket → AI Tutor validates ticket (Redis, one-time use) → loads learner context once → per-turn cascaded pipeline (mock STT → mock LLM → mock TTS), persisting transcript per turn → session end/timeout triggers single full-transcript analysis → publishes `speaking-session.analyzed` → Memory & Progress consumes and updates learner model + stores pattern findings. WebSocket integration test (via `ws` in Vitest) covers ticket issuance, handshake, multi-turn exchange, and session-end analysis + Kafka assertion.

**Deliverables**:
- Kong: `POST /api/speaking/session-ticket` (JWT-protected) → AI Tutor ticket-issuing endpoint. AI Tutor's WS endpoint (`wss://ai-tutor:PORT/ws/speaking`) is NOT routed through Kong (deliberate hybrid-ingress exception; exposed directly via docker-compose port mapping in dev).
- Prisma (`ai-tutor-service` additions): `SpeakingSession` (`userId`, `status`, `startedAt`, `endedAt`, `learnerContextSnapshot` jsonb), `SpeakingTurn` (`sessionId`, `turnIndex`, `userTranscript`, `tutorReplyText`, timestamps) — this is the session transcript store. Session tickets stored in Redis (not Postgres), TTL ~60s.
- Endpoints: `POST /internal/speaking/tickets` (issues short-lived Redis-backed ticket); WebSocket `wss://.../ws/speaking?ticket=...`.
- Memory & Progress: `GET /internal/learner-context/:userId` (aggregated level/timeBudget/goals/mastery/recent mistakes for session init); Kafka consumer `speaking-session.analyzed` → FSRS/mastery/mistake update + new `PatternFinding` table (`userId`, `sessionId`, `category`, `description`, `createdAt`).
- Inference interface usage (already defined Phase 3): `SttClient.transcribeAudio`, `TtsClient.synthesizeSpeech`, `LlmClient.tutorReply`, `LlmClient.analyzeSessionTranscript` — mocks return canned/templated responses.
- `packages/shared/src/realtime/protocol.ts`: WS message envelope (JSON control messages + binary audio frames).
- Kafka topic `speaking-session.analyzed`: `{eventId, userId, sessionId, errorSummary, patternFindings[], timestamp}`.
- Redis: `speaking-ticket:<ticket>` (TTL ~60s, one-time use).

**Sub-steps**: 1) define `speaking-session.analyzed` event schema → 2) `GET /internal/learner-context/:userId` → 3) Redis-backed ticket issuance + Kong route → 4) WebSocket server in AI Tutor (`ws` lib), ticket validation on connect → 5) session-init: load learner context once, snapshot it → 6) per-turn pipeline with mocks, async-persist `SpeakingTurn` → 7) session-end/timeout (idle WS heartbeat, default 5min configurable) → full-transcript analysis → publish event → 8) Memory & Progress consumer for `speaking-session.analyzed` → 9) e2e WS integration test.

**Depends on**: Phase 1 (Kong JWT + ticket pattern), Phase 3 (inference interface, learner context shape), Phase 4 (mock LLM patterns), Phase 5 (event publishing pattern).

**Out of scope for this phase** (deferred): MinIO per-turn audio persistence — revisit with pronunciation-feedback feature (README 7.6).

**Critical files**: `services/ai-tutor-service/src/realtime/wsServer.ts`, `services/ai-tutor-service/prisma/schema.prisma`, `services/memory-progress-service/src/routes/learnerContext.ts`, `packages/shared/src/realtime/protocol.ts`, `gateway/kong/kong.yml`.

---

## Phase 7 — Offline Sync Endpoints

**Exit criteria**: `GET /offline-package` returns due flashcards + FSRS state + latest highlight snapshot; `POST /offline-sync` replays queued review results through the same deterministic FSRS/learner-model logic as 8.2.3a; tests confirm sync replay produces identical FSRS state to the equivalent online attempt sequence.

**Deliverables**:
- Refactor: extract `applyReviewResult` domain function from the `attempt.recorded` consumer (Phases 3/4) into `services/memory-progress-service/src/domain/applyReviewResult.ts`, reused by both the consumer and the new sync endpoint.
- `GET /offline-package`: `{flashcardsDue[], fsrsState[], highlightSnapshot}` (highlight snapshot reuses Phase 4 Redis-cached generation, or generates+caches on demand).
- `POST /offline-sync`: `{reviews: [{itemId, itemType, rating, reviewedAt}]}`, replayed in timestamp order via `applyReviewResult`; idempotency via new `OfflineReviewLog` table keyed on client-generated `reviewId`.
- `packages/shared/src/dto/offline.ts`: `OfflinePackageDto`, `OfflineSyncRequestDto`, `OfflineSyncResultDto`.

**Sub-steps**: 1) refactor `applyReviewResult` (regression-test against Phase 3/4 tests) → 2) `GET /offline-package` → 3) `POST /offline-sync` with idempotency log + ordered replay → 4) test: offline review sequence vs. equivalent online sequence produce identical FSRS state.

**Depends on**: Phase 3 (FSRS/ReviewSchedule), Phase 4 (highlight caching).

**Critical files**: `services/memory-progress-service/src/domain/applyReviewResult.ts`, `services/memory-progress-service/src/routes/offline.ts`, `packages/shared/src/dto/offline.ts`.

---

## Phase 8 — Live AI Inference Integration

**Not yet scheduled.** Every phase above (0–7) is built and tested against `INFERENCE_MODE=mock` — `MockLlmClient`/`MockSttClient`/`MockTtsClient` returning deterministic canned responses, no GPU node, no real model calls anywhere in the repo. This phase is what swaps that out for the self-hosted, locally-run GPU inference stack described in README §6/§10, owned by a separate AI engineer. It starts whenever that engineer's local GPU inference node (LLM + co-located STT/TTS, running on local/on-prem hardware rather than a third-party cloud API) is ready to integrate against — no other phase depends on it, and Phases 0–7 should remain fully runnable in mock mode indefinitely (e.g. for CI, local dev, demos) even after this phase ships.

**Exit criteria**: setting `INFERENCE_MODE=live` in AI Tutor Service swaps in real `LlmClient`/`SttClient`/`TtsClient` implementations with no call-site changes anywhere in the codebase (onboarding path-gen, grading, highlight generation, speaking pipeline all consume the interface, not the mock directly); each live adapter is contract-tested against the same fixtures/assertions the mock currently satisfies; output quality (path coherence, grading accuracy, transcript correctness) is evaluated against a held-out review set, not just interface conformance; GPU resource contention (queuing/backpressure across concurrent LLM + STT + TTS calls) is load-tested.

**Deliverables**:
- Real adapters in `packages/shared/src/inference/` implementing the existing `LlmClient`/`SttClient`/`TtsClient` interfaces (no interface changes expected — if the live model needs request/response shapes the mock didn't anticipate, that's a sign the interface itself needs a small revision here, done carefully since every consumer above already codes against it).
- Config for reaching the local GPU inference node (hostname/port, timeouts, retry/backoff) — likely service-level env vars on AI Tutor Service only, since it remains the sole caller of the inference layer. No third-party API auth/secrets to manage: the model is self-hosted on local/on-prem GPU hardware, reachable like another internal service (e.g. added to `infra/docker-compose.yml` network, or a host/port the AI engineer's process exposes on the same local network) rather than over the public internet.
- Latency/timeout/error-handling story for real model calls in the previously-synchronous paths (`POST /grading/submit` for open-ended grading, `POST /onboarding` path generation) — these were instant with mocks; real inference latency may force a UX or architecture reconsideration (e.g. async grading for open-ended responses) that doesn't apply to the deterministic-grading path.
- GPU queuing/batching/priority/backpressure layer if concurrent load requires it (README §6 anticipates this as a future 3-layer split — business services / per-skill AI feature services / shared inference access layer — but don't build it preemptively; only if load-testing in this phase shows contention).
- Evaluation harness comparing live-model output against mock/reference expectations for each of the 5 `LlmClient` methods + STT/TTS accuracy, run as a one-off validation rather than part of the CI Vitest suite (model output isn't deterministic, so it can't be asserted the way mock-backed tests are).
- Pronunciation feedback (README §7.6, explicitly deferred in Phase 6) becomes in-scope here if it's prioritized, since it's the one feature that needs real audio analysis rather than text.

**Sub-steps**: 1) confirm the local GPU inference node is reachable from AI Tutor Service's network (same docker-compose network, or a host/port on the local network if it runs outside compose) — 2) implement `LiveLlmClient` against `generateLearningPath`/`gradeOpenResponse`/`generateHighlightContent`/`tutorReply`/`analyzeSessionTranscript`, one method at a time, contract-testing each against existing mock-based test expectations before moving to the next — 3) implement `LiveSttClient`/`LiveTtsClient` similarly — 4) wire `INFERENCE_MODE=live` switch in AI Tutor Service bootstrap — 5) load-test concurrent inference calls, add queuing/backpressure only if needed — 6) run the evaluation harness against held-out cases, iterate on prompts/configs — 7) staged rollout (`live` in staging first, `mock` fallback path kept available).

**Depends on**: Phase 3 (inference interface contract), Phase 4 (LLM call sites: onboarding, grading, highlights), Phase 6 (STT/TTS call sites: speaking pipeline) — i.e., everything that defines *where* inference is called; this phase only changes *what answers the call*.

**Critical files**: `packages/shared/src/inference/llmClient.ts`, `sttClient.ts`, `ttsClient.ts` (interfaces, should need minimal changes), new `packages/shared/src/inference/live/*.ts` (or wherever the AI engineer's adapters land), `services/ai-tutor-service/src/lib/inferenceClients.ts`-equivalent bootstrap wiring (wherever `INFERENCE_MODE` is currently read).

---

## Kafka Topic List (consolidated)

| Topic | Producer | Consumer(s) | Event shape (key fields) | Phase |
|---|---|---|---|---|
| `attempt.recorded` | AI Tutor | Memory & Progress | `{eventId, userId, exerciseId, attemptId, isCorrect, score, errorLabels[], gradedBy, timestamp}` | defined 3 / implemented 4 |
| `user.upserted` | User Service | Notification Service | `{eventId, userId, email, name, action, timestamp}` | 5 |
| `learning-path.ready` | AI Tutor | Notification Service | `{eventId, userId, pathId, timestamp}` | 5 |
| `achievement.unlocked` | Memory & Progress | Notification Service | `{eventId, userId, achievementType, metadata, timestamp}` | 5 |
| `review.due` | Memory & Progress (optional) | Notification Service | `{eventId, userId, dueCount, itemTypes[], timestamp}` | 5 (low priority) |
| `speaking-session.analyzed` | AI Tutor | Memory & Progress | `{eventId, userId, sessionId, errorSummary, patternFindings[], timestamp}` | 6 |

All events share a `BaseEvent` envelope (`eventId`, `schemaVersion`, `occurredAt`) defined in `packages/shared/src/events/base.ts`.

## Redis Usage List (consolidated)

| Key pattern | Purpose | TTL | Phase |
|---|---|---|---|
| `catalog-summary` | Cached Learning Materials catalog digest for path-gen prompts | ~1h | 4 |
| `highlight-content:<userId>:<contentHash>` | Cached AI-generated Review Center explanations/examples | ~24h | 4 |
| `speaking-ticket:<ticket>` | Short-lived realtime session ticket, one-time use | ~60s | 6 |
| `offline-highlight-snapshot:<userId>` | Pre-baked highlight snapshot for offline package | ~24h | 7 |

Redis is for ms-latency / cross-instance / expensive-to-recompute data, not a system of record — every cached value must be reconstructable.

## packages/shared Contents (consolidated)

```
packages/shared/src/
  ids.ts                 -- UserId (=clerkUserId), ModuleId, LessonId, ExerciseId, LearningPathId, AttemptId, SessionId...
  errors/                -- AppError, NotFoundError, ValidationError, UnauthorizedError + HTTP mapping
  auth/extractUserId.ts  -- decode clerkUserId from Kong-forwarded JWT
  dto/
    user.ts, learning-materials.ts, memory-progress.ts, offline.ts
  events/
    base.ts, attemptRecorded.ts, userUpserted.ts, learningPathReady.ts,
    achievementUnlocked.ts, reviewDue.ts, speakingSessionAnalyzed.ts
  inference/
    types.ts, llmClient.ts, sttClient.ts, ttsClient.ts, mocks/
  notifications/novuClient.ts
  realtime/protocol.ts
```

Built via `tsup`/`tsc` to `dist/`, consumed as `@ai-agentic-english/shared` (npm workspace `"*"` dependency).

---

## Verification (per phase, and end-to-end)

- **Phase 0**: `docker compose up -d` in `infra/` → all containers healthy; `npm run -ws --if-present dev` starts each service; `curl localhost:<kong-port>/api/health/<service>` returns 200 for all 5 services; `npm run test` and `npm run lint` pass at root.
- **Phase 1**: `curl` with no token → 401 via Kong; with a valid Clerk-issued JWT → `GET /api/users/me` returns the synced user; send a sample Clerk webhook payload (via `svix` test helper) → user upserted, idempotent on replay.
- **Phase 2**: seed script populates DB; `GET /api/modules` etc. return content without `answerKey`; `POST /api/assessment/score` returns consistent CEFR estimates for fixed inputs; attempting to mutate an existing `LearningPath` is rejected.
- **Phase 3**: unit tests for `ts-fsrs` integration against known reference scheduling outputs; `GET /api/exercises/next` returns the correct next item given seeded progress/schedule fixtures.
- **Phase 4**: integration test (compose-based, real Kafka/Redis) walking onboarding end-to-end (assessment → path → progress initialized → first exercise available) and exercise-attempt end-to-end (submit → feedback → async learner-model update visible); highlight generation cache-hit verified via mock-LLM call-count assertion.
- **Phase 5**: publish a test event on each topic → assert `MockNovuClient`/real Novu sandbox receives expected trigger; manually invoke scheduler jobs in test → assert dedup via `ScheduledReminderRun`.
- **Phase 6**: `ws`-based Vitest test: request ticket via Kong → connect WS → exchange several turns (mock pipeline) → end session → assert `SpeakingTurn` rows persisted and `speaking-session.analyzed` consumed by Memory & Progress with learner-model/`PatternFinding` updates.
- **Phase 7**: simulate an offline review queue, replay via `/offline-sync`, compare resulting `ReviewSchedule` rows to the state produced by the equivalent sequence of online attempts (Phase 4 path) — must match exactly.

Each phase's tests should run in CI against the Phase 0 docker-compose stack (or `testcontainers` equivalents) so the suite stays meaningful as services are added.

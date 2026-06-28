# Beyond Stage C Frontend-Backend Integration

## Summary
Continue after Stage C with a frontend-led integration plan that avoids backend and agent changes as much as possible. Before UI work, verify local infra and seed the learning-materials database exactly as described in `infra/README.md`, including required MinIO-backed passage audio. Assessment audio can remain unavailable for now because the Stage E UI degrades cleanly when `assessment-audio` is empty.

## Stage D — Infra And Learning Data Readiness

Goal: ensure the frontend is tested against real seeded learning material, not empty local databases.

- From the repo root, install workspaces and start infra:
  ```bash
  npm install
  cd infra && docker compose up -d --build
  ```
- Verify required services are healthy:
  ```bash
  curl http://localhost:4001/health
  curl http://localhost:8000/api/health/user-service
  curl http://localhost:4002/health
  curl http://localhost:4005/health
  curl http://localhost:8100/health
  ```
- Run learning-materials migrations:
  ```bash
  cd services/learning-materials-service
  npx prisma migrate deploy
  ```
- Seed core learning-materials rows:
  ```bash
  npm run seed
  npm run seed:vocab
  npm run seed:grammar
  npm run seed:generated
  ```
- Populate MinIO-backed passage audio after fresh Docker volume resets:
  ```bash
  pip3 install boto3
  python3 agents/tools/voa_passages_etl.py
  npm run seed:passages -w services/learning-materials-service
  ```
- Seed assessment rows even if the `assessment-audio` bucket is empty:
  ```bash
  npm run seed:assessment -w services/learning-materials-service
  ```
- Treat `python3 agents/tools/assessment_listening_etl.py` as optional/future until a stable source for assessment MP3s is available.
- Treat all seed scripts as idempotent and safe to re-run.
- Remember: Postgres rows and MinIO audio are separate; seeded `audioKey`s only play if the matching MinIO objects have also been uploaded. For this checkpoint, missing assessment audio objects are acceptable.

Exit criterion: learning-materials service is healthy, migrations are applied, real modules/exercises/assessment rows exist, and passage audio objects are present in local MinIO. The `assessment-audio` bucket may be empty.

## Stage E — Assessment UI Alignment

Goal: make onboarding assessment match current real assessment data using existing `/api/assessment/*` routes.

Status: completed after Stage D readiness, with `assessment-audio` allowed to remain empty.

- Remove speaking from onboarding assessment UI, result summaries, and question selection.
- Fetch questions from existing `GET /api/assessment/questions`.
- Submit answers to existing `POST /api/assessment/score`.
- Use the real reading/writing/listening question set returned by the backend.
- Store returned `levels` locally for results display and for deriving existing `currentLevel`.
- Keep the existing `/api/orchestrate/onboarding` request shape; do not add agent contract changes.
- Listening questions show audio when Stage F URL config and objects are available; otherwise they show audio unavailable, not transcript text.

Exit criterion: completed. Onboarding placement works with real reading/writing/listening questions only, no speaking test appears, returned `levels` are stored locally for result display/current-level derivation, and plan generation still uses the existing orchestrator contract.

## Stage F — Frontend Audio Playback With Minimal Backend Impact

Goal: play real listening audio without adding backend/agent media APIs.

- Add a frontend-only audio resolver helper using `NEXT_PUBLIC_AUDIO_BASE_URL`.
- For assessment listening, resolve against `assessment-audio`; an empty bucket is valid until stable assessment MP3s are available.
- For Practice Center listening, resolve against `passage-audio`; reserve `exercise-audio` for future rows.
- If the URL fails to load, render a clear unavailable-audio state.
- Do not add MinIO SDK usage, Kong routes, learning-materials media endpoints, or agent proxies.

Exit criterion: seeded audio plays where a public/static audio base URL is configured; otherwise UI degrades cleanly.

## Stage G — Practice Content Fidelity

Goal: Stage C’s backend-backed Practice Center displays real seeded module content accurately.

- Improve frontend prompt parsing for `mcq`, `fill-blank`, `sentence-correction`, and `listening-comprehension`.
- For listening exercises with playable `audioKey`, show audio and hide transcript before submission.
- Keep transcript/text fallback only for legacy rows with no usable audio URL.
- Preserve existing module/lesson/exercise fetches.
- Keep speaking practice unchanged and out of scope.
- Do not change grading behavior; backend dev owns wrong-answer feedback separately.

Exit criterion: generated reading, writing, and listening modules render from backend data without relying on old practice mock data.

## Stage H — Settings, Homepage, Progress

Goal: wire supported app surfaces to existing backend data only.

- Settings: load with `GET /api/users/me`; save with `PATCH /api/users/me/settings`.
- Homepage: use Clerk/user data plus `GET /api/learning-paths/:userId/active`.
- Progress: replace fake IELTS/static chart claims with active path summary and skill/activity distribution.
- Show clear empty states when the user has no active path.
- Do not build completion percentage, streak, attempt history, or new progress APIs.

Exit criterion: settings persist, homepage shows the active plan, and progress no longer shows fabricated values.

## Explicit Non-Goals

- Do not wire Review Center flashcards or grammar to backend data now.
- Do not add new backend routes for review, media, progress, or assessment.
- Do not change Python agent contracts for onboarding or grading.
- Do not change wrong-answer backend behavior here.
- Do not build SRS, notifications UI, or real-time speaking.

## Test Plan

- Data readiness: run the README health checks and seed commands above on a fresh local stack; `assessment-audio` may be empty.
- Frontend: onboarding uses only reading/writing/listening and submits to existing assessment routes.
- Frontend: assessment listening shows unavailable audio when `assessment-audio` is empty, and audio playback works when `NEXT_PUBLIC_AUDIO_BASE_URL` points at populated MinIO/static audio.
- Frontend: generated reading/writing/listening modules render real prompt shapes correctly.
- Frontend: settings save/reload through existing user-service routes.
- Frontend: homepage/progress use active path data and no fake IELTS/streak/progress values.

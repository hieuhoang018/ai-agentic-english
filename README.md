# AI Agentic English

A Progressive Web App that helps busy Vietnamese working professionals learn English, built
around a multi-agent AI architecture rather than a single monolithic assistant. Instead of a
fixed curriculum, the platform continuously models each learner — competence, vocabulary,
grammar error patterns, behavior, and goals — and uses that model to drive a personalized
learning path, a real-time AI conversation tutor, instant bilingual (English/Vietnamese)
feedback, and a Review Center that turns learning history into spaced-repetition practice.

Full product spec: **[docs/project-description.vn.md](docs/project-description.vn.md)**
(original, Vietnamese) · **[docs/project-description.en.md](docs/project-description.en.md)**
(English translation).

## What's in this repo

This repo hosts both the TypeScript backend/frontend and the Python AI agent stack:

| Path | What it is |
| --- | --- |
| `apps/web` | The PWA frontend (Next.js), owned largely independently — see `docs/minor-frontend-todo.md`. |
| `services/` | TypeScript backend services: `user-service`, `learning-materials-service`, `notification-service`. Each owns its own Postgres DB. |
| `agents/` | Python FastAPI stack — 11 specialized AI agents (`agt01_profiling` … `agt11_translation`) plus `agt_orchestrator`, covering AI tutoring, memory/progress, assessment, review generation, and recommendations. |
| `packages/` | Shared TypeScript code (`shared`, `config`) used across the Node services. |
| `gateway/` | Kong API Gateway declarative config — the single entry point for client traffic. |
| `infra/` | Docker Compose setup for local dev: Postgres per service, Redis, Kafka, MinIO, Kong, Ollama. |
| `docs/` | Architecture, planning, and implementation docs — see below. |

## Architecture at a glance

- **Multi-agent AI**, not one model: each agent (profiling, planning, tutoring, feedback,
  assessment, memory, review, progress analysis, recommendation, habit-building, translation)
  owns a narrow responsibility and communicates via defined APIs and Kafka events.
- **AI inference is mostly third-party cloud APIs**: the primary LLM path (`agents/shared/llm/router.py`) calls Groq then
  OpenRouter's free tier, with a genuinely self-hosted Ollama instance only as the last-resort
  backstop. STT is Groq's cloud Whisper API with a browser Web Speech API fallback
  (`agents/agt03_tutor/asr.py`); the tutor's TTS voice is entirely client-side (browser
  `SpeechSynthesis`). What's genuinely self-hosted: LanguageTool
  (grammar checking) and Ollama's embedding model (AGT-06).
- **Own-your-data services**: each backend service (TS or Python) owns its own database;
  cross-service references are by ID only.
- **Kong API Gateway** is the single ingress point, except the real-time speaking WebSocket,
  which uses a short-lived ticket handshake through Kong and then connects directly to the
  speaking agent.

See `docs/project-description.en.md` (sections 7–9) for the full architecture, data flow, and
per-agent design, and `docs/implementation-plan.md` for how the TypeScript side is actually
being built out phase by phase.

## Getting started

### Requirements

- **Node.js 22** (see `.nvmrc`) and npm, for the TS services and `apps/web`.
- **Docker + Docker Compose**, for Postgres (one instance per service), Redis, Kafka, MinIO, Kong,
  and Ollama — everything in `infra/docker-compose.yml` runs as containers, nothing is installed
  natively.
- **Python 3.13** with a virtualenv (`agents/requirements-base.txt` + per-agent
  `requirements.txt`), only if you're running or testing the `agents/` stack outside Docker.
- Enough free RAM for the Compose stack to be usable locally — Postgres ×4, Redis, Kafka, MinIO,
  Kong, and 11 Python agent services add up; 16 GB+ is recommended.
- API keys for live AI inference (`GROQ_API_KEY`, `OPENROUTER_API_KEY`) and a Clerk app
  (`CLERK_ISSUER`) — optional for a basic `docker compose up`, which defaults to
  `INFERENCE_MODE=mock`; see `infra/README.md` and `CLAUDE.local.md` for the real-inference
  variant.

```bash
npm install
cd infra && docker compose up -d --build
```

See `infra/README.md` for the full local dev quickstart (ports, health checks, seeding) and
`docs/implementation-plan.md` for the current phase status of the TS services.

## Key docs

- [`docs/project-description.vn.md`](docs/project-description.vn.md) /
  [`docs/project-description.en.md`](docs/project-description.en.md) — the full product spec:
  background, requirements, features, system architecture, data flows, and AI agent design.
- [`infra/README.md`](infra/README.md) — local development environment.

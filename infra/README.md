# Infra

Local development and deployment infrastructure: Docker / Docker Compose definitions for the services, per-service PostgreSQL instances, Redis, MinIO, Kafka and Kong.

Hosting provider for production is not yet decided (see root `README.md` section 10.5).

## Dev quickstart

From the repo root:

```bash
npm install                       # install all workspaces
cd infra && docker compose up -d --build
```

This brings up:

- 5x Postgres (one per service): `postgres-user` (5433), `postgres-learning-materials` (5434),
  `postgres-memory-progress` (5435), `postgres-ai-tutor` (5436), `postgres-notification` (5437)
- `redis` (6379), `kafka` (9092, KRaft single-node), `minio` (9000 API / 9001 console) +
  `minio-init` (one-shot, creates the `audio` and `attachments` buckets)
- `kong` (8000 proxy / 8001 admin), DB-less, declarative config from `gateway/kong/kong.yml`
- The 5 backend services, each built from its own `Dockerfile`, exposed on 4001-4005 and
  also reachable through Kong

### Verify

```bash
curl http://localhost:4001/health                      # direct
curl http://localhost:8000/api/health/user-service      # via Kong
```

Repeat for `learning-materials-service` (4002), `memory-progress-service` (4003),
`ai-tutor-service` (4004), `notification-service` (4005).

### Other useful commands

```bash
npm run build   # build all workspaces
npm run lint    # eslint across the monorepo
npm test        # vitest across all workspaces
npm run format  # prettier --write
```

See `infra/.env.example` for the environment variables each service expects (current
docker-compose defaults are dev-only and hardcoded; the `.env.example` also documents
variables needed by later phases such as Clerk and Novu).

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

- 3x Postgres (TS services): `postgres-user` (5433), `postgres-learning-materials` (5434),
  `postgres-notification` (5437)
- 1x Postgres (agent LTM, pgvector): `postgres-agents` (5438)
- `redis` (6379), `kafka` (9092, KRaft single-node), `minio` (9000 API / 9001 console)
- `kong` (8000 proxy / 8001 admin), DB-less, declarative config from `gateway/kong/kong.yml`
- TS backend services: `user-service` (4001), `learning-materials-service` (4002),
  `notification-service` (4005), all reachable through Kong
- Python agent services: `agt01`–`agt11` (ports 8101–8111) + `agt-orchestrator` (8100)

### Verify

```bash
curl http://localhost:4001/health                        # user-service direct
curl http://localhost:8000/api/health/user-service       # via Kong
curl http://localhost:4002/health                        # learning-materials-service
curl http://localhost:4005/health                        # notification-service
curl http://localhost:8100/health                        # agt-orchestrator
```

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

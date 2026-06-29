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

### Seed the learning-materials database

`docker compose up` creates empty databases — none of the services run migrations or seed data
automatically. For a fresh local machine, run migrations once, then load the committed
learning-materials seed files. From the repo root:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
  npx prisma migrate deploy --schema services/learning-materials-service/prisma/schema.prisma

DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
  npm run seed --workspace @ai-agentic-english/learning-materials-service
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
  npm run seed:vocab --workspace @ai-agentic-english/learning-materials-service
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
  npm run seed:grammar --workspace @ai-agentic-english/learning-materials-service
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
  npm run seed:passages --workspace @ai-agentic-english/learning-materials-service
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
  npm run seed:assessment --workspace @ai-agentic-english/learning-materials-service
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
  npm run seed:generated --workspace @ai-agentic-english/learning-materials-service
```

All six loaders are idempotent and load from files already committed to git
(`prisma/seed.ts`'s inline fixture, or `prisma/seed-data/*.jsonl` for the rest). A complete
local catalog currently has 21 modules total: 3 hand-written modules plus 18 generated modules
(58 generated lessons / 270 generated exercises). `seed:passages` and `seed:assessment` create
the correct Postgres rows on any machine, but the *audio files* referenced by those rows live in
MinIO and need the extra step below before listening content can play.

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

## MinIO-backed audio content (passages, assessment listening)

`docker compose up` gives you an **empty** MinIO — the `passage-audio` and `assessment-audio`
buckets get created (by `minio-init-agents`), but the actual mp3 files inside them are not part
of the repo and are not synced between machines. `audioKey` values in Postgres (seeded from
`prisma/seed-data/passage_seed.jsonl` / `assessment_seed.jsonl`, which *are* in git) are just
object-key strings — they only resolve to real audio against whichever MinIO instance actually
has that file uploaded. Each developer's MinIO is local to their own Docker volume
(`minio-data`), so pulling git + re-running the seed scripts gives you correct Postgres rows
with `audioKey`s pointing at nothing on your machine until you also populate MinIO yourself.

**Current approach (per-machine, do this after every fresh `docker compose up` / volume reset):**
re-run the ETL scripts that originally fetched the audio. They re-download from the original
public sources and re-upload to whichever MinIO `MINIO_ENDPOINT` points at (defaults to your
local `localhost:9000`), so this is safe to run repeatedly and works offline-from-each-other —
no file transfer between teammates needed, just redundant fetching from the same public sources.

Important: the passage JSONL is already committed. The passage ETLs below do **not** append
duplicate JSONL rows for existing titles; they check whether the expected MinIO object exists
and restore it if missing.

```bash
# one-time: the scripts use boto3 (Python), not in the repo's normal Python deps.
pip3 install boto3

# VOA passages with audio: A2/B1 material -> `passage-audio`
python3 agents/tools/voa_passages_etl.py

# LibriVox passages with audio: B2/C1 material used by generated listening modules
python3 agents/tools/librivox_etl.py

# Assessment listening questions' audio (12 clips -> `assessment-audio`)
python3 agents/tools/assessment_listening_etl.py

# Re-run the loaders after audio restore if your database was empty or reset.
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
  npm run seed:passages --workspace @ai-agentic-english/learning-materials-service
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
  npm run seed:assessment --workspace @ai-agentic-english/learning-materials-service
```

The A1 State Department passages in `passage_seed.jsonl` are text-only by design, so
`agents/tools/statedept_a1_etl.py` is only needed when regenerating the committed seed file, not
when populating MinIO. All audio ETLs are idempotent (safe to re-run) and read
`MINIO_ENDPOINT`/`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` from the environment if you need to point
them somewhere other than the docker-compose defaults (`http://localhost:9000`,
`minioadmin`/`minioadmin`).

**Long-term direction, not implemented yet:** replace each developer's isolated local MinIO with
a shared/team-reachable object store (a network-accessible MinIO instance, or real cloud
storage), so `audioKey` resolves consistently for everyone instead of requiring this per-machine
re-fetch step. No infra decision has been made on this yet.

**Serving audio to the frontend (2026-06-28):** `learning-materials-service` exposes
`GET /api/audio/url?bucket=<bucket>&key=<key>` (Clerk-JWT-protected, via Kong) that returns a
1-hour presigned URL the browser can use directly as an `<audio src>`. The per-machine upload
step above is still required for the URL to resolve — the endpoint signs and serves whatever
objects are actually present in MinIO, it doesn't fetch or upload anything itself. See
`docs/frontend-backend-integration-plan.md` §Stage C for the frontend usage pattern.

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

### Seed the database

`docker compose up` creates empty databases — none of the services run migrations or seed data
automatically. For `learning-materials-service`, run migrations once, then each seed script you
need (all idempotent — safe to re-run, none depend on another having run first):

```bash
cd services/learning-materials-service
npx prisma migrate deploy        # create tables

npm run seed                     # hand-written curriculum fixture: Modules/Lessons/Exercises
npm run seed:vocab               # vocab spine (CEFR-leveled word list)
npm run seed:grammar             # grammar primitives
npm run seed:passages            # reading/listening passages (needs MinIO audio first — see below)
npm run seed:assessment          # placement assessment questions (needs MinIO audio first — see below)
npm run seed:generated           # LLM-generated exercise content (Phase C)
```

All six load from files already committed to git (`prisma/seed.ts`'s inline fixtures, or
`prisma/seed-data/*.jsonl` for the rest) — running them gives you correct Postgres rows on any
machine. `seed:passages` and `seed:assessment` are the two where the *audio* referenced by the
seeded rows needs an extra step (next section) before it actually plays anything.

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
public VOA source and re-upload to whichever MinIO `MINIO_ENDPOINT` points at (defaults to your
local `localhost:9000`), so this is safe to run repeatedly and works offline-from-each-other —
no file transfer between teammates needed, just redundant fetching from the same public source.

```bash
# one-time: the scripts use boto3 (Python), not in the repo's normal Python deps
pip3 install boto3

# passages + their audio (26 articles → `passage-audio` bucket)
python3 agents/tools/voa_passages_etl.py
npm run seed:passages -w services/learning-materials-service

# assessment listening questions' audio (12 clips → `assessment-audio` bucket)
python3 agents/tools/assessment_listening_etl.py
npm run seed:assessment -w services/learning-materials-service
```

Both scripts are idempotent (safe to re-run) and read `MINIO_ENDPOINT`/`MINIO_ACCESS_KEY`/
`MINIO_SECRET_KEY` from the environment if you need to point them somewhere other than the
docker-compose defaults (`http://localhost:9000`, `minioadmin`/`minioadmin`).

**Long-term direction, not implemented yet:** replace each developer's isolated local MinIO with
a shared/team-reachable object store (a network-accessible MinIO instance, or real cloud
storage), so `audioKey` resolves consistently for everyone instead of requiring this per-machine
re-fetch step. No infra decision has been made on this yet — flagged as a known gap, tracked in
the server-side status notes alongside the rest of the MinIO/audio gaps (TS has no MinIO client
anywhere; this ETL-script approach is intentionally the only thing in the repo that talks to
MinIO directly).

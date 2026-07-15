# JMeter perf tests

Design doc / full plan: `docs/jmeter-perf-test-plan.md`. This directory is the
implementation: a `.jmx` covering the endpoints that don't need seeded data,
plus the auth setup it depends on.

## One-time setup

**1. Point Kong at the test-issuer consumer.** `gateway/kong/kong.yml` (the
real config) only trusts the real Clerk app. `perf/kong-perf.yml` is a copy
of it with one addition — a second consumer that also trusts
`packages/shared/src/testing/index.ts`'s self-signed `TEST_ISSUER` keypair
(the same one every service's test suite already uses via `signTestToken`).
Apply it:

```bash
docker compose -f infra/docker-compose.yml -f perf/docker-compose.perf.yml up -d --force-recreate kong
```

Revert to the real config when you're done perf testing:

```bash
docker compose -f infra/docker-compose.yml up -d --force-recreate kong
```

**2. Generate tokens.**

```bash
node perf/generate-tokens.mjs 20 perf/tokens.csv
```

Writes `perf/tokens.csv` (gitignored) with `clerkUserId,jwt` rows for
`perf-user-0000` .. `perf-user-00NN`, tokens valid 4 hours. Re-run any time
tokens expire mid-session, or with a larger N before a higher-concurrency
run (the CSV Data Set Config recycles rows across threads, so more distinct
users means less cross-thread collision on per-user rate limits at high
thread counts).

## Running

GUI mode (build/debug only, few threads):

```bash
jmeter -t perf/ai-agentic-english.jmx
```

CLI mode (real runs — always run from `perf/` so the CSV Data Set Config's
relative path resolves):

```bash
cd perf
jmeter -n -t ai-agentic-english.jmx -l results.jtl -Jthreads=2 -Jrampup=1 -Jloops=1   # smoke
jmeter -n -t ai-agentic-english.jmx -l results.jtl -Jthreads=50 -Jrampup=30 -Jloops=20  # load
jmeter -g results.jtl -o report/   # HTML dashboard after any CLI run
```

`threads`/`rampup`/`loops` are JMeter properties (`-J`), defaulting to
`2`/`1`/`1` if omitted — that default is the smoke test.

For a stress test (stepping concurrency up in stages to find where errors or
latency start to degrade — see Scenario 3 in `docs/jmeter-perf-test-plan.md`),
run the CLI command above multiple times with increasing `-Jthreads` against
separate `-l` output files, then compare error rate and p95/p99 latency
across the stages.

## Seeding realistic data

```bash
.venv/bin/python perf/seed_perf_users.py 20   # match generate-tokens.mjs's count
```

Inserts real rows into `postgres-agents` for `perf-user-0000..NNNN` — a
learner profile, 5 sessions with errors, a conversation, ~15 vocab words
(half due for review), and an active learning plan. Re-run any time; it
scopes a `DELETE ... WHERE clerk_user_id LIKE 'perf-user-%'` first so it
never touches real data and stays reproducible.

## Scope

Covered: catalog, all 6 per-user reads (streak, recommendations, profile,
sessions, review-center, schedule/due), and a real write flow: GET due items
→ extract a real `vocab_id` → `POST /api/schedule/:id/rate`.

**Not yet built** (see `docs/jmeter-perf-test-plan.md` for the full design):
- `PATCH .../conversations/:id/title`, `POST /api/offline/sync` — need
  real seeded conversation/offline-log IDs, not yet wired into the `.jmx`.
- Rate-limited/LLM-backed endpoints (`/api/orchestrate/*`, `/api/plan/replan`,
  `/api/translate`) — deliberately excluded from this plan; run those
  separately, small-scale, mock-mode-first per the design doc.
- Soak scenario — `-Jthreads/-Jrampup/-Jloops` are wired up; a real soak run
  (30-60 min sustained) hasn't been executed yet.

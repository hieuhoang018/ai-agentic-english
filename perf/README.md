# JMeter perf tests

Design doc / full plan: `docs/jmeter-perf-test-plan.md`. This directory is the
implementation: a smoke-test-verified `.jmx` covering the endpoints that
don't need seeded data, plus the auth setup it depends on.

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
tokens expire mid-session.

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

## Seeding realistic data

```bash
.venv/bin/python perf/seed_perf_users.py 20   # match generate-tokens.mjs's count
```

Inserts real rows into `postgres-agents` for `perf-user-0000..NNNN` — a
learner profile, 5 sessions with errors, a conversation, ~15 vocab words
(half due for review), and an active learning plan. Re-run any time; it
scopes a `DELETE ... WHERE clerk_user_id LIKE 'perf-user-%'` first so it
never touches real data and stays reproducible.

## What's covered right now

Catalog, all 6 per-user reads (streak, recommendations, profile, sessions,
review-center, schedule/due), and a real write flow: GET due items → extract
a real `vocab_id` → `POST /api/schedule/:id/rate`. Verified end-to-end
against seeded data: 0 errors.

**Not yet built** (see `docs/jmeter-perf-test-plan.md` for the full design):
- `PATCH .../conversations/:id/title`, `POST /api/offline/sync` — need
  real seeded conversation/offline-log IDs, not yet wired into the `.jmx`.
- Rate-limited/LLM-backed endpoints (`/api/orchestrate/*`, `/api/plan/replan`,
  `/api/translate`) — deliberately excluded from this plan; run those
  separately, small-scale, mock-mode-first per the design doc.
- Soak scenario tuning — `-Jthreads/-Jrampup/-Jloops` are wired up; a real
  soak run (30-60 min sustained) hasn't been executed yet.

## Results so far (local dev machine, mock inference mode)

Ran `-Jthreads=30 -Jrampup=15 -Jloops=20` (4200 requests target). Real
finding: **per-request latency is excellent when a request gets through**
(p50 3-15ms, p95 5-25ms across every endpoint, backend is not the
bottleneck at this scale) — but **92% of requests got a `429`** almost
immediately. This is exactly the "shared Kong rate-limit bucket" gotcha
documented above and in the design doc, confirmed empirically: Kong's
`rate-limiting` plugin keys by *consumer*, and every synthetic user's token
shares the one `perf-test-clerk` consumer, so the global 300/min ceiling is
one shared bucket across all simulated users, not 300/min *each*. Real
finding, not a JMeter bug — reproduce with `jmeter -g results.jtl -o report/`
for the full breakdown. If you want to load-test past that ceiling
meaningfully, either accept it's testing "one Kong node's aggregate limit"
(valid, real behavior) or raise `infra/docker-compose.yml`'s global
`rate-limiting` plugin config for the duration of a perf run (do not do this
for the real deployed config without a security discussion first).

## Known finding from building this (fixed)

**Bug #1** - `signTestToken()` (`packages/shared/src/testing/index.ts`)
didn't set an `nbf` claim, so tokens it minted always failed Kong's `jwt`
plugin — every route's `claims_to_verify` includes `nbf` (added in the
July 6 gateway-hardening pass, PR #41). Not perf-test-specific: any
Kong-level test using this widely-used helper would've hit the same 401.
Fixed by adding `.setNotBefore(...)` to the signer — one line, all 34
existing `packages/shared` tests still pass.

**Bug #2** - `POST /api/schedule/:id/rate` 500'd on every real due-item
rating (`asyncpg.exceptions.UndefinedColumnError: column "next_review_at"
of relation "vocabulary_mastery" does not exist`). Not a code bug —
migration `012_vocab_next_review.sql` (and `016`/`017`) had never been
applied to this machine's `postgres-agents` volume, even though the repo's
own migration files were correct and up to date. Fixed by applying all
`agents/migrations/*.sql` in order (idempotent, safe to re-run) via
`docker exec -i <container> psql -U postgres -d agent_ltm < <file>`. This
is a real gap worth knowing about: nothing tracks which migrations have
been applied on a given machine (no `schema_migrations` table), so a
teammate's local `postgres-agents` volume can silently drift behind the
migration files in git with no error until something like this hits it
under real load.

## Known finding from building this

`signTestToken()` (`packages/shared/src/testing/index.ts`) didn't set an
`nbf` claim, so tokens it minted always failed Kong's `jwt` plugin — every
route's `claims_to_verify` includes `nbf` (added in the July 6 gateway-
hardening pass, PR #41). This wasn't perf-test-specific: any Kong-level test
using this well-established helper would have hit the same 401. Fixed by
adding `.setNotBefore(...)` to the signer — one-line, additive, all 34
existing `packages/shared` tests still pass.

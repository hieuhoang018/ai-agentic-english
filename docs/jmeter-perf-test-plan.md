# JMeter performance test plan

Status: planned, not yet implemented (no `.jmx` file, scripts, or `perf/` directory exist yet).

## Context

The app is a Kong-fronted set of 3 TS services + 11 Python agents, all JWT-gated except
`/health` and `/webhooks/*`. Nothing has been perf-tested yet — no `.jmx` file, no load-test
docs, no perf tooling anywhere in the repo (checked). The goal is to build a repeatable JMeter
setup that measures realistic latency/throughput/error-rate under load for the endpoints that
actually matter (the ones real users hit through Kong), without depending on live Clerk auth or
burning real LLM-provider quota, and while accounting for a few app-specific behaviors that would
otherwise silently distort results (a shared Kong rate-limit bucket across all simulated users,
single-worker uvicorn per agent, mock vs. live inference mode).

## Key setup decisions (and why)

**1. Test through Kong (`localhost:8000`), not services directly.** That's the only path real
traffic takes — it includes JWT validation and rate-limiting overhead, both real cost.

**2. Auth: use the existing test JWT keypair, not real Clerk tokens.**
`packages/shared/src/testing/index.ts` already has `signTestToken({ sub, expiresInSeconds,
issuer })` — a self-signed RS256 token mirroring a Clerk session token, built for exactly this
("mirrors a Clerk-issued session token"). It's already what every service's test suite signs
against. Two things to check/align before this works against Kong:
- The checked-in `gateway/kong/kong.yml` consumer currently pins `rsa_public_key` to
  `elegant-anchovy-29.clerk.accounts.dev` (the real Clerk app), not `TEST_ISSUER`
  (`https://test-clerk.example.com`) — drifted from the file's own header comment. For perf
  runs, swap the consumer's `key`/`rsa_public_key` back to `TEST_ISSUER`/`TEST_JWKS` (or add a
  second consumer) so tokens can be minted locally, offline, with arbitrary `sub` values and no
  Clerk dependency. This is additive/reversible — a perf-only Kong config, not a change to the
  real dev config.
- A small Node script (using `jose`/`signTestToken`, same as the test suites) pre-generates a
  batch of `{clerkUserId, jwt}` pairs into a CSV for JMeter to consume. Token `exp` should cover
  the full test run (`expiresInSeconds` set past the longest planned soak test).

**3. Test data: seed synthetic users with real rows, not empty accounts.** Endpoints like
`/api/habit/library` (4-way fan-out), `/api/review-center`, `/api/schedule/due` return
near-empty payloads for a user with no history — that understates real DB query cost and
payload size. Need N synthetic `clerkUserId`s with seeded rows across: User Service Postgres
(basic profile), Learning Materials (a learning path), and `postgres-agents` (AGT-01 profile,
AGT-02 plan, AGT-06 sessions/conversations/errors, AGT-07 SM-2 schedule, AGT-10 streak). Reuse
existing seed scripts (`npm run seed:*`, each service's Prisma seed) as a base, then write a
one-off perf-seed script that inserts N variations keyed by the same `clerkUserId`s the token
generator produced.

**4. Inference mode: `INFERENCE_MODE=mock` (the base `docker-compose.yml` default) for load/
stress/soak runs.** The orchestrator (`/api/orchestrate/onboarding`, `/api/orchestrate/grading`),
AGT-02 replan, and AGT-11 translate all call out to Groq/OpenRouter in `live` mode — real dollar
cost per request and the provider's own rate limits, which would cap and distort results before
this app's own limits are found. Run a *separate, small, explicitly-scoped* live-mode test later
(single-digit concurrency, few iterations) only if latency-under-real-inference is a specific
question — not as part of the main load/stress/soak suite.

**5. Run JMeter in non-GUI (CLI) mode, from the host, against the existing `docker compose up -d
--build` stack.** GUI mode is for building/debugging the test plan only (few threads). Actual
runs: `jmeter -n -t plan.jmx -l results.jtl -e -o report/`. Since Docker Desktop and JMeter share
the same machine's CPU here, treat absolute throughput numbers as relative/comparative (before
vs. after a change) rather than absolute production capacity — flag this caveat in the report
rather than pretending otherwise.

## App-specific gotchas that affect test design

- **All authenticated traffic shares one Kong consumer.** The JWT plugin matches consumers by
  the token's `iss` claim only (there's one consumer, `clerk-test`/whatever it's renamed to for
  perf), not by `sub`. Kong's `rate-limiting` plugin defaults to `limit_by: consumer` when a
  consumer is identified (confirmed: no route sets `limit_by` except the IP-keyed webhook route).
  That means the global 300/min·3000/hour floor, and the tighter per-route caps (orchestrator
  20/min·200/hour, speaking-ticket 10/min·60/hour, schedule/offline 30/min·300/hour), are shared
  **across every simulated user**, not per-user. A load test with 50 concurrent virtual users
  hitting `/api/schedule/due` will hit the 30/min cap almost immediately — that's real Kong
  behavior, not a JMeter bug, but it means you're testing "one Kong node's aggregate ceiling,"
  not "50 users' individual experience." Design thread groups with this in mind (see Scenarios).
- **Every Python agent runs a single uvicorn worker** (`CMD ["uvicorn", ..., "--host", "0.0.0.0",
  "--port", ...]`, no `--workers`, confirmed across agt10/agt_orchestrator/agt03 Dockerfiles).
  CPU-bound work inside a request (e.g. AGT-08's CUSUM/PELT, AGT-05's IRT) blocks that single
  event loop for everyone else on that agent. Expect per-agent throughput ceilings well below
  what horizontal scaling would give — useful data, not a bug to "fix" before testing.
- **Kafka side effects are invisible to JMeter.** A sync response returning fast doesn't mean the
  downstream consumer (Notification Service, AGT-08 consumers, etc.) kept up. Out of scope for
  JMeter itself; note it as a gap if it matters.
- **MinIO-backed audio endpoints are machine-local state**, not relevant to most flows tested
  here except `/api/audio/url` — fine to include, just know the presigned-URL issuance is what's
  measured, not actual audio bytes transferred.
- **The AGT-03 speaking WebSocket is explicitly out of scope for the JMeter plan.** JMeter can
  open the socket (via a WebSocket plugin) and hit `POST /api/speaking/session-ticket`, but real
  audio-turn timing (STT/TTS round trip) isn't something JMeter meaningfully simulates. Load-test
  the ticket issuance endpoint only; leave full conversational-turn load testing as a follow-up
  with a different tool if it's ever needed.

## Endpoints to cover (grouped by how they behave under load)

| Group | Endpoints | Notes |
|---|---|---|
| Cheap reads (DB-backed, no fan-out) | `GET /api/habit/streak`, `GET /api/recommendations`, `GET /api/profile`, `GET /api/sessions` | Baseline latency floor |
| Aggregation / fan-out | `GET /api/habit/library` (4-way internal fan-out incl. AGT-02 today's plan) | Likely the heaviest "normal" read |
| Bundle reads | `GET /api/review-center`, `GET /api/schedule/due` | Larger payloads, real joins |
| Writes / mutations | `POST /api/schedule/rate`, `PATCH /api/review-center/.../title`, `POST /api/offline/sync` | Watch for write contention / connection pool exhaustion under concurrency |
| Catalog (LM service) | `GET /api/modules`, `/api/lessons`, `/api/exercises`, `/api/learning-paths` | Cacheable-content baseline, no per-user fan-out |
| Rate-limited / expensive | `POST /api/orchestrate/onboarding`, `POST /api/orchestrate/grading`, `POST /api/plan/replan`, `POST /api/translate` | Run mock-mode for capacity; separate small live-mode run for real latency |
| Ticket-only | `POST /api/speaking/session-ticket` | HTTP part only, not the WS session |

## JMeter test plan structure

Single `.jmx` (`perf/ai-agentic-english.jmx`, new `perf/` dir at repo root):
- **CSV Data Set Config** reading the pre-generated `{clerkUserId, jwt}` CSV, one row consumed
  per thread iteration (`Recycle on EOF: true` for long soak runs, sized so no two concurrent
  threads share a row if endpoints are IDOR-guarded per-user, which most are via
  `require_matching_user`).
- **HTTP Request Defaults**: `localhost`, port `8000`, protocol `http`.
- **HTTP Header Manager**: `Authorization: Bearer ${jwt}`, `Content-Type: application/json`.
- One **Transaction Controller** per endpoint group above, each containing its HTTP sampler(s),
  under a **Throughput Controller** (or simple weighting via multiple threads-per-group) to
  approximate a realistic traffic mix rather than hammering every endpoint equally — e.g. reads
  >> writes >> orchestrator calls.
- **Response Assertions** per sampler: expect 200/201 for authenticated+valid requests; a
  separate scenario intentionally expects 429 (see Scenarios) so a 429 there isn't a false
  failure.
- **Listeners for CLI runs**: none in the `.jmx` itself (GUI listeners kill CLI throughput) —
  results go to `-l results.jtl`, then `jmeter -g results.jtl -o report/` for the HTML dashboard
  (aggregate report, response-time percentiles, error %, throughput-over-time graphs) after the
  run. Use View Results Tree / Summary Report only in GUI mode while building/debugging.

## Test scenarios

1. **Smoke** (GUI mode, 1–3 threads, 1 iteration each): validates the plan itself — auth works,
   every sampler returns 2xx, assertions pass. Run this first, always, before any real load run.
2. **Load test**: ramp to a target concurrent-user count over N seconds, hold steady for M
   minutes, ramp down. Pick the target below the shared Kong rate-limit ceilings for the routes
   being tested (or explicitly test with `limit_by: consumer` in mind — see gotcha above), and
   measure p50/p95/p99 latency + error rate per endpoint group.
3. **Stress test**: same shape as load, but step concurrency up in stages until error rate or
   p95 latency degrades sharply — finds the actual breaking point (likely one of: Postgres
   connection pool per service, single-uvicorn-worker CPU ceiling on an agent, or the Kong
   rate-limit floor itself, depending on which endpoint).
4. **Soak test**: moderate, sustainable concurrency held for 30–60+ minutes — watches for
   Postgres connection leaks, Redis memory growth, or gradual latency creep across the run
   (correlate with `docker stats` sampled in parallel).
5. **Rate-limit verification** (separate small scenario, expects 429s): deliberately exceed a
   route's cap (e.g. orchestrator's 20/min) with a handful of threads to confirm Kong actually
   enforces it and recovers cleanly after the window — assertion here expects a mix of 200/429,
   not all-200.

## Deliverables (once implemented)

- `perf/ai-agentic-english.jmx` — the test plan described above.
- `perf/generate-tokens.mjs` — Node script using `packages/shared`'s `signTestToken` to emit the
  CSV of `{clerkUserId, jwt}` pairs.
- `perf/seed-perf-users.*` — one-off seed script(s) populating the synthetic users' rows across
  the relevant service DBs (reusing each service's existing Prisma seed patterns / AGT SQL
  migrations as reference).
- `perf/README.md` — how to: point Kong at the test issuer for a perf run (and revert), generate
  tokens, seed data, run each scenario via CLI, generate the HTML report, and the gotchas above
  (shared rate-limit bucket, single-worker agents, mock-vs-live inference) so results aren't
  misread later.
- Kong perf config: either a small documented edit to swap the consumer key/public key for a
  local run (revert after), or (cleaner, if worth the extra step) a second declarative Kong
  service file used only for perf runs — decide during implementation based on how disruptive
  editing the checked-in `kong.yml` feels for a one-off local run.

## Verification (once implemented)

- Run the smoke scenario in GUI mode first — every sampler must return 2xx before trusting any
  load numbers.
- Run one short load scenario against `GET /api/habit/streak` (cheapest endpoint) as a sanity
  baseline before running the heavier fan-out/orchestrator scenarios.
- Confirm the rate-limit scenario actually produces 429s (proves the Kong config swap didn't
  accidentally disable rate-limiting along with the issuer swap).
- Cross-check one load-test run's error rate/latency against `docker compose logs` for the
  agents under test, to catch silent errors JMeter's assertions might not surface (e.g. a 200
  with an empty/malformed body).

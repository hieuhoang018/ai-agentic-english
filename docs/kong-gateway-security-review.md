# Kong gateway — security review (rate limiting + related gaps)

**Date checked:** 2026-07-06
**Checked by:** Hieu (verified directly against `gateway/kong/kong.yml`, `infra/docker-compose.yml`,
`infra/docker-compose.prod.yml`)
**Scope:** API Gateway (Kong) level only — this is not a full app-layer security review.

**Verdict: 🟠 Action needed before a real production deploy.** No rate limiting exists anywhere in
the gateway today, and two other gaps (an unauthenticated Admin API and a hardcoded JWT key shared
between dev and prod) are more urgent than rate limiting itself.

**Status update (2026-07-06, same day):** §2.1 and §2.2 fixed on `server/gateway-fix` — see notes
inline at each finding. §2.3–2.5 still open.

---

## 1. What's configured today

`gateway/kong/kong.yml` (309 lines, DB-less/declarative config, Kong 3.8) has exactly two plugin
types in use, both minimal:

| Plugin | Scope | Config |
|---|---|---|
| `cors` | Global (`kong.yml:37-53`) | `origins: [http://localhost:3000]` only — dev-only, hardcoded |
| `jwt` | Per-route, on every authenticated route (15 occurrences) | `claims_to_verify: [exp]` only — no `nbf`, no audience check |

Nothing else. No `rate-limiting`, no `rate-limiting-advanced`, no `request-size-limiting`, no
`bot-detection`, no `ip-restriction`, no `acl`, anywhere in the file.

`/api/health/*` and `/api/webhooks/user-service` are deliberately left without the `jwt` plugin —
correct for health checks; the webhook route verifies its own Svix signature downstream
(`services/user-service/src/routes/webhooks.ts:36`), so that specific route is not actually open,
just not gated at Kong.

---

## 2. Findings, ranked by severity

### 🔴 2.1 — Kong Admin API is exposed with zero authentication, in both dev and prod — ✅ fixed

`infra/docker-compose.yml`'s admin port publish is now `127.0.0.1:8001:8001` (host-loopback only,
verified live: unreachable from the host's LAN-facing IP, still curlable from the host itself).
`infra/docker-compose.prod.yml` additionally overrides `KONG_ADMIN_LISTEN` to `127.0.0.1:8001` so
Kong itself refuses non-loopback admin connections in prod — verified live that even the host's
own loopback can no longer reach the published port in that config, matching "never publish it
directly, use `docker exec`/SSH tunnel if ever needed."

`infra/docker-compose.yml:131-143`:

```yaml
kong:
  image: kong:3.8
  environment:
    KONG_DATABASE: 'off'
    KONG_DECLARATIVE_CONFIG: /kong/declarative/kong.yml
    KONG_PROXY_LISTEN: 0.0.0.0:8000
    KONG_ADMIN_LISTEN: 0.0.0.0:8001
  ports:
    - '8000:8000'
    - '8001:8001'
```

- `KONG_ADMIN_LISTEN` binds the Admin API to **all interfaces**, and port 8001 is **published to
  the host**.
- Kong's Admin API has **no authentication by default** — anyone who can reach port 8001 can read
  the entire running config (including the JWT consumer's RSA public key and every route
  definition) and hit admin-only endpoints (`/status`, `/metrics`, `/config`, etc.).
- `infra/docker-compose.prod.yml` **does not override the `kong` service at all** — grepped for a
  `kong:` block in that file and found nothing. Production inherits this exact configuration
  unchanged.

**Fix**: bind `KONG_ADMIN_LISTEN` to `127.0.0.1:8001` (or an internal-only Docker network) and drop
the `8001:8001` host port mapping in `docker-compose.prod.yml`. If remote admin access is ever
needed, front it with its own auth (Kong Manager + RBAC, or an SSH tunnel) — never publish it
directly.

### 🔴 2.2 — Same `kong.yml` drives both dev and prod; the JWT key is a hardcoded dev-Clerk test key — ✅ fixed

`gateway/kong/kong.yml:18-32`:

```yaml
consumers:
  - username: clerk-test
    jwt_secrets:
      - key: https://elegant-anchovy-29.clerk.accounts.dev
        algorithm: RS256
        rsa_public_key: |
          -----BEGIN PUBLIC KEY-----
          ...
          -----END PUBLIC KEY-----
```

The file's own header comment (`kong.yml:6-11`) says outright:

> To swap in a real Clerk app, regenerate `rsa_public_key` from the Clerk JWKS and update
> `key`/`rsa_public_key` below — no other config changes are needed.

That swap is a **manual, undocumented-in-automation step** — there is no environment-specific
override, no templating from an env var, and no CI step that regenerates this file per
environment. `infra/docker-compose.yml:140` mounts the single committed file straight into the
container (`../gateway/kong/kong.yml:/kong/declarative/kong.yml:ro`) for every environment.

Risk: a production deploy either (a) silently keeps validating against the dev Clerk test issuer
if someone forgets the manual swap, or (b) drifts out of sync the next time Clerk rotates its
signing key, since nothing re-fetches the JWKS automatically. `gateway/kong/scripts/jwks-to-pem.mjs`
already exists to do the fetch — it's just not wired into any deploy step.

**Fix**: automate this — e.g. run `jwks-to-pem.mjs` against the real Clerk JWKS at deploy time and
template it into `kong.yml` (or a prod-specific overlay file), rather than relying on a manual
paste. At minimum, add a deploy-checklist / CI assertion that the committed key doesn't match the
known dev issuer before a prod deploy proceeds.

**Implemented**: `gateway/kong/scripts/render-kong-config.mjs` (new; reuses the JWKS-fetch logic
factored out of `jwks-to-pem.mjs` into `scripts/lib/jwks.mjs`) reads `kong.yml`, fetches the real
Clerk JWKS for a required `CLERK_ISSUER` env var (no default — refuses to run rather than falling
back to the dev issuer), and writes `kong.generated.yml` (gitignored) with only the issuer/PEM
swapped, byte-identical otherwise (verified: rendering against the *same* dev issuer reproduces
`kong.yml` exactly). Also refuses to run against the known dev-test issuer without an explicit
`ALLOW_DEV_ISSUER=true` escape hatch. `infra/docker-compose.prod.yml` points
`KONG_DECLARATIVE_CONFIG` at the generated file. Verified live: Kong boots clean against the
rendered file ("declarative config loaded from ... kong.generated.yml") and proxies a real route.
Must be re-run on every deploy (documented in `gateway/kong/README.md` and `infra/README.md`) —
there's no automatic key-rotation refresh, just a fresh fetch each time this script runs.

### 🟠 2.3 — No rate limiting anywhere (the original question)

Zero instances of `rate-limiting` or `rate-limiting-advanced` in `kong.yml`. Highest-value routes
to protect, ranked by abuse/cost potential:

| Route | Why it matters |
|---|---|
| `POST /api/orchestrate/onboarding`, `POST /api/orchestrate/grading` (`kong.yml:188-218`) | Proxy to `agt-orchestrator`, which calls out to LLMs (Groq/OpenRouter per `agents/shared/llm/router.py`). Unthrottled = a valid JWT (or a leaked one) can drive real, ongoing inference cost with no ceiling. |
| `POST /api/speaking/session-ticket` (`kong.yml:220-234`) | Issues Redis-backed session tickets. No limit on how often one identity can mint tickets today. |
| `POST /api/offline` sync (`kong.yml:236-251`) | Replay endpoint (AGT-07 SM-2 sync) — no limit on sync frequency or payload count. |
| `POST /api/webhooks/user-service` (`kong.yml:66-72`) | No `jwt` plugin (correct — Svix-verified downstream) **and no rate limit** — wide open to being hammered before signature verification even runs, which itself costs CPU per request. |

**Fix**: add a `rate-limiting` plugin (free, ships with Kong OSS — no need for the `-advanced`
tier at this scale) per route above, keyed by consumer. Reasonable starting point: a
per-minute cap on the orchestrator routes tied to expected real usage patterns (a user isn't
submitting grading requests every second), a stricter cap on ticket issuance (one active ticket
already enforces single-use, but nothing stops rapid re-issuance), and a basic global default rate
limit as a floor for everything else.

### 🟡 2.4 — No request-size-limiting plugin at the gateway

The three TS services get an app-layer backstop from `express.json()`'s default 100kb limit
(`services/*/src/app.ts` — `user-service`, `learning-materials-service`, `notification-service` all
call plain `express.json()` with no explicit `limit` override, so they get Express's built-in
default). That default is reasonable, but it's **per-framework, not per-gateway** — I did not
confirm an equivalent default exists on the FastAPI/Starlette agent routes proxied through Kong
(`agt-orchestrator`, `agt03-tutor`'s ticket route, `agt07-review`'s offline sync). A
`request-size-limiting` plugin at Kong would enforce one consistent cap regardless of what each
backend framework defaults to, and would reject oversized bodies before they reach any backend at
all.

### 🟢 2.5 — Minor / lower priority

- **JWT plugin only verifies `exp`** (`claims_to_verify: [exp]` everywhere) — Kong's `jwt` plugin
  also supports verifying `nbf` (not-before); adding it is a one-line change per route and closes
  a narrow window for prematurely-issued tokens. Low urgency.
- **CORS is hardcoded to `http://localhost:3000` only** (`kong.yml:40-41`) — expected to need the
  real production origin added before a real deploy; flagging because, per §2.2, this is the same
  single file used for both environments today, so it's easy to forget alongside the JWT-key swap.
- **No bot-detection / IP-restriction plugins** — reasonable to skip at current MVP scale; revisit
  if abuse patterns show up in practice.
- **Carried over from `docs/homepage-progress-integration-plan.md`**: every `clerk_user_id`
  path-param route (AGT-08/09/10 GETs, offline sync) trusts the path parameter over the JWT `sub`
  claim — an IDOR gap, not a rate-limiting one, but worth deciding *where* to fix it (once at the
  gateway via a custom/pre-function plugin, vs. four times, once per agent) in the same pass as
  the rate-limiting work, since both are "add a Kong plugin across these same routes" changes.

---

## 3. Recommended priority order

1. **Lock down the Admin API** (§2.1) — highest severity, cheapest fix (a docker-compose env/port
   change), no application code involved.
2. **Automate the JWT-key swap for prod** (§2.2) — highest severity, moderate effort (needs a
   deploy-time templating step), and it's an auth-bypass-adjacent risk, not just hygiene.
3. **Add rate limiting** (§2.3) to the four routes listed, starting with the orchestrator routes
   (real dollar cost exposure).
4. **Add request-size-limiting** (§2.4) globally or per-route.
5. **Minor items** (§2.5) — bundle into the same PR as #3 since they touch the same file and the
   same routes.

None of this requires new infrastructure — Kong 3.8 (already running) ships `rate-limiting`,
`request-size-limiting`, and `ip-restriction` in its open-source bundle; this is entirely a
`kong.yml` (+ one docker-compose) change.

---

## 4. References

- `gateway/kong/kong.yml` — full route/plugin inventory, checked in full (309 lines).
- `infra/docker-compose.yml:131-148` — Kong service definition (Admin API exposure).
- `infra/docker-compose.prod.yml` — confirmed no `kong:` override block exists.
- `gateway/kong/scripts/jwks-to-pem.mjs` — existing script that could be wired into a deploy-time
  key-refresh step instead of a manual paste.
- `services/user-service/src/routes/webhooks.ts:36` — confirms webhook signature verification
  happens downstream of Kong, independent of any gateway-level gating.
- `docs/homepage-progress-integration-plan.md` — source of the pre-existing IDOR observation
  referenced in §2.5.

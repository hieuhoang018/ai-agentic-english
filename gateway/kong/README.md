# Kong Gateway

Configuration for Kong, the single entry point for client-to-backend traffic (routing, token auth, observability).

Handles the auth handshake for the real-time speaking feature (issues a short-lived session ticket); the audio WebSocket itself connects directly to the AI Tutor service, bypassing the gateway.

See root `README.md` sections 7.3 and 10.5.

## JWT issuer/key: dev vs prod

`kong.yml` is committed with a hardcoded dev-Clerk test issuer and RSA public key — fine for
local dev (`docker compose up` uses this file as-is, no extra steps).

**Prod never uses `kong.yml` directly.** `infra/docker-compose.prod.yml` points Kong's
`KONG_DECLARATIVE_CONFIG` at `kong.generated.yml` instead (gitignored, not committed). Render it
before every prod deploy:

```bash
CLERK_ISSUER=https://your-real-app.clerk.accounts.dev npm run kong:render
```

This fetches the real Clerk JWKS and writes `kong.generated.yml` with the issuer/key swapped in
(everything else copied verbatim from `kong.yml`, comments included). `CLERK_ISSUER` has no
default and the script refuses to run against the known dev issuer without an explicit
`ALLOW_DEV_ISSUER=true` override — a forgotten env var fails the deploy loudly instead of
silently validating against the dev test issuer.

Re-run this on **every** deploy, not just the first — it always fetches the current JWKS, so this
is also how a Clerk key rotation gets picked up (there's no other refresh mechanism).

`scripts/jwks-to-pem.mjs` is the older manual one-off variant (prints a PEM to paste by hand) —
still useful for inspection, but `render-kong-config.mjs` is what deploys should use.

The same render step also handles the CORS origin swap — pass
`CORS_ORIGIN=https://your-real-app.com` (comma-separated for multiple origins) to replace the
dev-only `http://localhost:3000` allowlist. Optional: unset just means CORS blocks the real
frontend until it's set, which is a loud failure, not a silent security gap.

## Rate limiting & request size

Every route gets a global floor (300/min, 3000/hour, `plugins:` top of `kong.yml`) plus a
`request-size-limiting` cap (1 MB) so oversized bodies get rejected before reaching any backend.
Four routes get a stricter, route-specific `rate-limiting` cap on top, because they're either
LLM-cost-bearing or otherwise cheap to abuse: `agt-orchestrator` onboarding/grading (20/min, real
inference cost per call), `agt03` speaking-ticket issuance (10/min — single-use only stops replay
of an already-issued ticket, not rapid re-issuance), and `agt07` offline sync (30/min). The
webhook route (no `jwt` plugin, Svix-verified downstream) is keyed by IP instead of consumer since
there's no JWT identity on that route.

All `rate-limiting` instances use `policy: local` (in-memory per Kong node) — correct for the
single Kong instance this stack runs today. If Kong is ever scaled to multiple nodes, switch to
`policy: redis` (the `redis` container already exists in this stack) — `local` counters don't
sync across nodes and would let a client get through per-node limits × node count.

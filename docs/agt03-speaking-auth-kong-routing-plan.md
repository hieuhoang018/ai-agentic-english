# Plan: AGT-03 Speaking Session Auth + Kong Routing

## Status

Draft, 2026-07-06. Not started. Written after auditing the actual current code (not the
earlier-referenced `docs/agt03-realtime-speaking-integration-plan.md` — that file was cited in
`CLAUDE.local.md` as "drafted 2026-07-02" but never actually exists in git history; treat that
citation as stale/incorrect, not a prior version of this plan).

## Problem

`agents/agt03_tutor`'s WebSocket (`WS /ws/sessions/{session_id}`, handled by
`agt03_tutor/websocket_handler.py`) has **zero authentication**. The `clerk_user_id` used for
the entire session — profile lookups, grammar/translation fan-out, Kafka `session.start`/
`session.end` events, AGT-01's downstream profile update — comes straight from the client's
`{"type": "start", "clerk_user_id": ..., "skill_focus": ...}` message
(`websocket_handler.py:handle_session`, the `msg_type == "start"` branch). Any client can claim
to be any `clerk_user_id`.

This was a known, accepted gap while AGT-03 was backend-only and reached exclusively by tests
and curl. As of PR #37 (`fe-be-integrate-phase3`, merged 2026-07-02/03), `apps/web`'s
`useSpeakingRealtimeSession` hook (`apps/web/app/main/practice-center/_hooks/
useSpeakingRealtimeSession.ts`) connects the real practice-center speaking UI **directly** to
this WebSocket using `NEXT_PUBLIC_SPEAKING_WS_BASE_URL` (default `ws://localhost:8103`), reading
`clerk_user_id` from Clerk's `useUser()` and sending it verbatim in the `start` message. The gap
is no longer theoretical — it's reachable from the shipped UI, by any signed-in user, for any
`clerk_user_id` they choose to type into a modified request.

Separately, there is **no Kong route for AGT-03 at all** — `gateway/kong/kong.yml` has zero
`agt03`/`8103` entries. `README.md` §7.3/§10.5 describes the intended shape ("Kong issues a
short-lived session ticket over REST; the WebSocket itself connects directly to AGT-03,
bypassing the gateway") but the ticket-issuing endpoint doesn't exist anywhere in the codebase.

This plan closes both gaps: add the missing ticket-issuance endpoint + Kong route, and make the
WebSocket honor it, while keeping local dev/tests working without requiring Kong to be running.

## Design

A short-lived, single-use, server-issued **ticket** binds a `clerk_user_id` (taken from a
Kong-validated JWT, not client input) to a specific `session_id`, stored in Redis with a TTL.
The WebSocket, when a ticket is present, uses the ticket's `clerk_user_id` as ground truth and
ignores whatever the client's `start` message claims — closing the impersonation gap regardless
of whether ticket use is mandatory yet.

```
Frontend                     Kong                    AGT-03 (8103)              Redis
   |-- POST /api/speaking/session-ticket -----> jwt plugin validates ------->|
   |                                             (Authorization: Bearer ...)  |
   |                                                                          |-- SET speaking-ticket:{ticket}
   |                                                                          |   { session_id, clerk_user_id, skill_focus }
   |                                                                          |   EX 60
   |<---------------- { ticket, session_id, expires_in_seconds: 60 } --------|
   |
   |-- WS /ws/sessions/{session_id}?ticket=... ------------------------------------------------> (direct, bypasses Kong)
   |                                                            AGT-03 GETDEL speaking-ticket:{ticket}, validates, binds clerk_user_id
```

Key decisions and why:

- **Ticket issuance derives identity from the JWT, not the request body.** Reuses
  `agents/shared/auth/clerk.py`'s `extract_user_id(authorization)` — the same decode-only,
  Kong-already-validated pattern used by AGT-09/10's IDOR guards (`require_matching_user`). No
  new auth primitive needed.
- **The WebSocket itself still bypasses Kong** (per README's documented design and how AGT-03 is
  already deployed) — only the ticket-issuance REST call goes through Kong/JWT. This means the
  WebSocket must independently validate the ticket itself; it cannot rely on Kong having done
  that for the WS connection.
- **Ticket carries `session_id`**, so the frontend stops generating its own `session_id` via
  `crypto.randomUUID()` and instead uses the one the ticket issuance call returns — the ticket
  and the session it's valid for are the same object, not two things that have to be kept in
  sync.
- **Single-use, consumed at WebSocket connect time**, via an atomic Redis `GETDEL` (or
  `GET`+`DEL` if the redis-py version in use lacks `GETDEL` — check `redis.asyncio` version
  pinned in `agents/requirements-base.txt` before choosing). Prevents replay even within the
  60s window.
- **Enforcement is a feature flag (`REQUIRE_SPEAKING_TICKET`), default `false`.** Existing
  `agt03_tutor/tests/test_websocket_handler.py` connects with no ticket and sends
  `clerk_user_id` directly — those must keep passing unmodified. Default `false` in
  `docker-compose.yml`; set `true` in `docker-compose.prod.yml`'s `agt03-tutor` block (see
  Known Issues in `CLAUDE.local.md` re: `infra/.env`'s `INTERNAL_SECRET` — same overlay file,
  same "flip to strict in prod" pattern already established there).
- **Ticket identity wins even when not required.** If a ticket is present and valid, its
  `clerk_user_id` overrides whatever the client's `start` message says, regardless of the
  `REQUIRE_SPEAKING_TICKET` flag. Only the *absence* of a ticket is flag-gated. This means once
  the frontend is updated (Stage 3 below), the real impersonation gap is closed in every
  environment immediately, before the flag is ever flipped to `true` anywhere — the flag only
  controls whether a ticket is *mandatory*, not whether a *provided* ticket is trusted.

## Stage 1 — Ticket issuance endpoint on AGT-03

File: `agents/agt03_tutor/main.py` (new route), plus a small new module, e.g.
`agents/agt03_tutor/tickets.py`, for the Redis read/write + `SpeakingTicketRequest`/
`SpeakingTicketResponse` Pydantic models (keep `models.py`'s existing pattern of one models file
per agent if preferred instead — either is fine, just be consistent with the agent's existing
layout).

- `POST /speaking/session-ticket`
  - Request body: `{"skill_focus": "SPEAKING"}` (optional, defaults to `"SPEAKING"` — this is
    the only skill focus the speaking feature uses today; keep the field for forward
    compatibility, don't over-build).
  - Auth: `Authorization: Bearer <jwt>` header, required. Use
    `agents.shared.auth.clerk.extract_user_id(authorization)` to get `clerk_user_id` — do **not**
    accept `clerk_user_id` from the request body.
  - Behavior:
    1. `session_id = str(uuid.uuid4())`
    2. `ticket = secrets.token_urlsafe(32)`
    3. Redis `SET speaking-ticket:{ticket} <json: {session_id, clerk_user_id, skill_focus}> EX 60 NX`
       (the `NX` isn't strictly needed since `ticket` is freshly random, but costs nothing)
    4. Return `{"ticket": ticket, "session_id": session_id, "expires_in_seconds": 60}`
  - **Do not** return a full `ws_url` in the response. AGT-03 doesn't know whether the caller is
    a browser on `localhost:8103`, a docker-network hostname, or a production domain — that's
    exactly the ambiguity `NEXT_PUBLIC_SPEAKING_WS_BASE_URL` already exists to resolve
    client-side (`apps/web/app/main/practice-center/_types/speaking-realtime.ts`'s
    `getSpeakingWsBaseUrl()`/`buildSpeakingSessionWebSocketUrl()`). Let the frontend combine
    `session_id` with its own base URL, same as it does today.
- Add `REQUIRE_SPEAKING_TICKET: bool = False` to AGT-03's settings (check whether AGT-03 has its
  own `Settings` subclass or uses `agents.shared.config.settings` directly — add it wherever
  `INFERENCE_MODE`-style per-agent flags already live for this agent, following existing
  conventions, not a new pattern).

**Acceptance:**
- Valid JWT → ticket issued, Redis key exists with TTL ≈ 60s, correct JSON value.
- Missing/malformed `Authorization` header → 401, matching `extract_user_id`'s existing
  behavior (no new error shape invented).
- Two calls from the same user produce two different tickets/session_ids (no accidental reuse).

## Stage 2 — WebSocket ticket validation

File: `agents/agt03_tutor/websocket_handler.py` (or a small helper it calls, e.g. in the new
`tickets.py` from Stage 1 — keep ticket-lookup logic in one place, don't duplicate the Redis
key format string between issuance and consumption).

- `handle_session(websocket, session_id)` gains a ticket-check step, run **before**
  `await websocket.accept()`:
  1. Read `ticket = websocket.query_params.get("ticket")`.
  2. If `ticket` is present: `GETDEL speaking-ticket:{ticket}` (or `GET` then `DEL` — see Stage 1
     note on redis-py version). If the key doesn't exist (expired/already used) → reject.
     If it exists but its stored `session_id` doesn't match the URL's `session_id` path param →
     reject (defense in depth — a ticket is only valid for the session it was issued for).
     On success, remember the ticket's `clerk_user_id`/`skill_focus` for use in Stage 3.
  3. If `ticket` is absent or invalid:
     - If `REQUIRE_SPEAKING_TICKET` is `true` → reject.
     - Else → proceed with no ticket-derived identity (current behavior, dev/test fallback).
  4. **Reject** means: `await websocket.close(code=4401)` and `return`, without calling
     `websocket.accept()` first. (4401 is in the 4000–4999 "private use" range per RFC 6455 —
     pick any unused value in that band and document it once, e.g. as a module constant
     `TICKET_REJECTED_CLOSE_CODE = 4401`, so the frontend can reference the same constant.)
- Update the `msg_type == "start"` branch: if a ticket was validated in step 2, use its
  `clerk_user_id`/`skill_focus` instead of `message.get("clerk_user_id")`/
  `message.get("skill_focus")`. If no ticket was validated (dev fallback path), keep the
  existing behavior of trusting the message body. Either way, the rest of `start_session`'s
  signature and behavior is unchanged — this only changes *where the identity comes from*, not
  what happens with it.

**Acceptance:**
- Valid ticket + matching `session_id` → connection accepted, session starts under the ticket's
  `clerk_user_id`, regardless of what (if anything) the `start` message's `clerk_user_id` field
  says.
- Valid ticket bound to a *different* `session_id` than the URL → rejected with 4401.
- Expired or already-consumed ticket → rejected with 4401 when `REQUIRE_SPEAKING_TICKET=true`;
  when `false`, falls through to the no-ticket dev path instead of hard-rejecting (a stale
  ticket shouldn't break local dev if the flag is off).
- No ticket at all, `REQUIRE_SPEAKING_TICKET=false` → existing behavior, unchanged (this is what
  keeps `test_websocket_handler.py`'s current tests passing without modification).
- No ticket at all, `REQUIRE_SPEAKING_TICKET=true` → rejected with 4401.
- Second connection attempt reusing the same ticket → rejected (proves single-use/`GETDEL`
  actually deletes).

## Stage 3 — Kong route

File: `gateway/kong/kong.yml`. Add a new service+route following the exact pattern already used
for `agt-orchestrator-onboarding` (see lines ~188–203):

```yaml
  - name: agt03-speaking-ticket
    url: http://agt03-tutor:8103/speaking/session-ticket
    routes:
      - name: agt03-speaking-ticket-route
        paths:
          - /api/speaking/session-ticket
        strip_path: true
        methods:
          - POST
          - OPTIONS
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp
```

**Acceptance:**
- `docker compose config` (or Kong's own `/config` reload) shows the route.
- `curl -X POST http://localhost:8000/api/speaking/session-ticket` with no token → 401 from
  Kong's JWT plugin (never reaches AGT-03).
- Same call with a valid test JWT (see `gateway/kong/scripts/jwks-to-pem.mjs` /
  `packages/shared/src/testing`'s test-token helper, or the Python equivalent
  `agents/shared/testing/jwt.py` added in the AGT-09/10 IDOR work) → 200 with a ticket.

## Stage 4 — Frontend wiring

Files: `apps/web/app/api/speaking/session-ticket/route.ts` (new — same server-side
Clerk-token-to-Kong-proxy shape as `apps/web/app/api/orchestrate/onboarding/route.ts`), and
`apps/web/app/main/practice-center/_hooks/useSpeakingRealtimeSession.ts` (existing, needs
changes).

- New Next.js route handler, mirroring `orchestrate/onboarding/route.ts`'s shape: get
  `userId`/`getToken()` from `auth()`, 401 if missing, POST to Kong's
  `/speaking/session-ticket` via `apiFetch` with the bearer token, return `{ticket, session_id,
  expires_in_seconds}` (or the Kong/AGT-03 error passed through, same pattern as the existing
  route's `isApiError` handling).
- `useSpeakingRealtimeSession`'s connect effect (currently: generate `sessionId` locally via
  `createSessionId()` at the top of the hook, then open the socket immediately) changes to:
  1. On mount (once `isLoaded && user?.id`), `POST /api/speaking/session-ticket`.
  2. On success, use the **returned** `session_id` (not a locally generated one) to build the WS
     URL: `buildSpeakingSessionWebSocketUrl(session_id)` + `?ticket=<ticket>` query param — add a
     small helper next to `buildSpeakingSessionWebSocketUrl` in `speaking-realtime.ts` for
     appending the ticket, rather than string-concatenating ad hoc in the hook.
  3. On failure: set `status = 'error'` with a clear message — **do not** silently fall back to
     an unticketed connection. (The plan's original two-phase design allowed a no-ticket
     fallback for *initial* rollout convenience; now that Stage 1–3 exist, there's no reason for
     the frontend to ever skip requesting a ticket — the backend-side `REQUIRE_SPEAKING_TICKET`
     flag is what controls whether the *server* is lenient, not the client.)
  4. Keep sending `clerk_user_id: user.id` in the `start` message for now (harmless — the server
     ignores it whenever a valid ticket was consumed, per Stage 2) rather than a protocol
     version bump; revisit dropping the field once `REQUIRE_SPEAKING_TICKET=true` everywhere and
     it's provably dead.
- `.env.example` needs no new entries — `NEXT_PUBLIC_SPEAKING_WS_BASE_URL` is reused as-is; the
  ticket call goes through the existing Kong-proxy pattern (`API_BASE_URL`/Clerk token), same as
  every other `/api/orchestrate/*`-style route.

**Acceptance:**
- Opening the practice-center speaking page performs a ticket request before any WebSocket
  connect is attempted (visible in Network tab / a quick manual check).
- A forced ticket-request failure (e.g. temporarily point `API_BASE_URL` somewhere invalid)
  surfaces as the existing `error` status/UI, not a silent unticketed connection.
- End-to-end manual browser check: start a speaking session, send one text turn, one audio turn,
  end the session — same acceptance criteria as `docs/speaking-fe-be-integrate.md` Stage 5,
  re-run now that the ticket hop is in the path.

## Stage 5 — Tests

- Backend (`agents/agt03_tutor/tests/`, run via the repo's `.venv`:
  `python -m pytest agents/agt03_tutor/tests/`):
  - `test_tickets.py` (new): issuance stores the right Redis key/value/TTL; issuance 401s
    without a bearer token; issuance ignores/rejects a client-supplied `clerk_user_id` in the
    body if one is sent (prove the endpoint can't be tricked into issuing a ticket for someone
    else).
  - `test_websocket_handler.py` (existing, extend): valid ticket accepted and identity used;
    mismatched `session_id` rejected; expired/consumed ticket rejected under
    `REQUIRE_SPEAKING_TICKET=true`; no-ticket path still passes unmodified under the default
    `false`; reused ticket rejected (single-use proof).
- Frontend: `npm run lint --workspace apps/web`, `npm run build --workspace apps/web` (or the
  repo's usual typecheck command — confirm exact script name in `apps/web/package.json` before
  running).
- Integration smoke (after Docker stack is up): curl the Kong route with no token (401), with a
  valid token (200 + ticket), then use that ticket on a direct `wscat`/browser WS connect to
  confirm end-to-end — same style of verification already done for the AGT-09/10 IDOR guards
  (`CLAUDE.local.md`'s homepage-progress section describes the exact curl-through-Kong-then-
  direct-port pattern to reuse here).

## Rollout

1. Land Stages 1–2 with `REQUIRE_SPEAKING_TICKET` defaulting to `false` everywhere — no behavior
   change for anyone yet, purely additive.
2. Land Stage 3 (Kong route) and Stage 4 (frontend) — real traffic starts using tickets, but the
   server still accepts unticketed connections too, so nothing breaks if the frontend deploy and
   backend deploy land at slightly different times.
3. Once Stage 4 has been live for a bit with no unticketed-connection stragglers (check AGT-03
   logs or add a log line in the `REQUIRE_SPEAKING_TICKET=false` no-ticket branch to make this
   observable), flip `REQUIRE_SPEAKING_TICKET=true` in `docker-compose.prod.yml`'s
   `agt03-tutor` block. Leave it `false` in the base `docker-compose.yml` so local dev and the
   existing no-ticket tests keep working without needing Kong running.

## Explicitly out of scope

- **AGT-06 conversation-history IDOR** (`GET /ltm/{clerk_user_id}/conversations`) — a distinct,
  already-known issue blocking that endpoint from being Kong-exposed. Unrelated surface, listed
  separately in `CLAUDE.local.md`'s known issues; do not fold it into this plan.
- **Server-side TTS** — not needed here, already resolved architecturally (browser
  `SpeechSynthesis`), see `CLAUDE.local.md` Phase 6 section.
- **Rate-limiting ticket issuance** — not addressed by this plan. If abuse becomes a concern,
  that's a Kong rate-limiting-plugin addition on the `/api/speaking/session-ticket` route,
  independent of the auth mechanism itself.
- **Multi-instance Redis/session-affinity concerns** — out of scope; AGT-03 already depends on
  Redis being a shared, reachable store for session state (`STM` via AGT-06), so tickets living
  in the same Redis add no new infrastructure assumption.

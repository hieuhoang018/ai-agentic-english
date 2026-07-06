"""
Speaking-session tickets: a short-lived, single-use, server-issued token
binding a clerk_user_id (from a Kong-validated JWT) to a specific
session_id, so the WebSocket handler doesn't have to trust the identity a
client claims in its "start" message. See
docs/agt03-speaking-auth-kong-routing-plan.md.
"""

from __future__ import annotations

import json
import secrets
import uuid

from pydantic import BaseModel

from agents.shared.db.redis_client import get_redis

TICKET_TTL_SECONDS = 60
TICKET_REJECTED_CLOSE_CODE = 4401

_TICKET_KEY_PREFIX = "speaking-ticket:"


class SpeakingTicketRequest(BaseModel):
    skill_focus: str = "SPEAKING"


class SpeakingTicketResponse(BaseModel):
    ticket: str
    session_id: str
    expires_in_seconds: int


async def issue_ticket(clerk_user_id: str, skill_focus: str = "SPEAKING") -> SpeakingTicketResponse:
    session_id = str(uuid.uuid4())
    ticket = secrets.token_urlsafe(32)
    payload = json.dumps({
        "session_id": session_id,
        "clerk_user_id": clerk_user_id,
        "skill_focus": skill_focus,
    }).encode()

    redis = await get_redis()
    await redis.set(_TICKET_KEY_PREFIX + ticket, payload, ex=TICKET_TTL_SECONDS, nx=True)

    return SpeakingTicketResponse(ticket=ticket, session_id=session_id, expires_in_seconds=TICKET_TTL_SECONDS)


async def consume_ticket(ticket: str) -> dict | None:
    """Atomically reads and deletes a ticket so it can never be replayed.
    Returns None if the ticket doesn't exist (expired, already used, or
    never issued)."""
    redis = await get_redis()
    raw = await redis.getdel(_TICKET_KEY_PREFIX + ticket)
    if raw is None:
        return None
    return json.loads(raw)

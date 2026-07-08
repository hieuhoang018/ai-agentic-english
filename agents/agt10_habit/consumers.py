"""
AGT-10 Kafka consumers.

  session.end -> handle_session_end
    Delegates to record_session_complete, which advances a day-keyed streak
    counter (see service.py). Idempotent per sessionId — at-least-once Kafka
    delivery must not double-count a redelivered event.
"""
from __future__ import annotations

import asyncio
import logging

from agents.shared.events.consumer import consume
from agents.agt10_habit.service import record_session_complete

logger = logging.getLogger(__name__)


async def handle_session_end(topic: str, event: dict) -> None:
    """
    event fields: clerkUserId (required), sessionId (required).
    Emitted by AGT-03 at session end. AGT-03 only emits this event for
    sessions with at least one completed turn (see
    agents/agt03_tutor/service.py end_session), so every event reaching this
    handler already represents a qualifying session.
    """
    clerk_user_id = event.get("clerkUserId")
    session_id = event.get("sessionId")
    if not clerk_user_id or not session_id:
        logger.warning("handle_session_end: missing clerkUserId/sessionId in %s", event)
        return

    try:
        result = await record_session_complete(clerk_user_id, session_id)
        logger.info(
            "handle_session_end: streak updated user=%s streak=%d recorded=%s",
            clerk_user_id, result["streak"], result["session_recorded"],
        )
    except Exception as exc:
        logger.error(
            "handle_session_end: streak update failed user=%s err=%s",
            clerk_user_id, exc,
        )


async def start_consumers() -> list[asyncio.Task]:
    """Launch the session.end consumer as a background task."""
    return [
        asyncio.create_task(
            consume(
                ["session.end"],
                "agt10-session-end",
                handle_session_end,
            )
        ),
    ]

"""
AGT-10 Kafka consumers.

  agent.session.end -> handle_session_end
    Reads the persisted Redis streak, increments it, and records the session.
    At-least-once — record_session_complete reads authoritative state from Redis
    before writing, so duplicate events increment at most once per real session
    (Redis SET is idempotent if streak already updated).
"""
from __future__ import annotations

import asyncio
import logging

from agents.shared.events.consumer import consume
from agents.agt10_habit.service import get_streak, record_session_complete

logger = logging.getLogger(__name__)


async def handle_session_end(topic: str, event: dict) -> None:
    """
    event fields: clerkUserId (required), durationMinutes (optional, defaults 0).
    Emitted by AGT-03 at session end.
    """
    clerk_user_id = event.get("clerkUserId")
    if not clerk_user_id:
        logger.warning("handle_session_end: missing clerkUserId in %s", event)
        return

    duration = float(event.get("durationMinutes", 0))
    try:
        current = await get_streak(clerk_user_id)
        result = await record_session_complete(clerk_user_id, current, duration)
        logger.info(
            "handle_session_end: streak updated user=%s streak=%d",
            clerk_user_id, result["streak"],
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

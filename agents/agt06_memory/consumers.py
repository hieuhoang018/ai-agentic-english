"""
AGT-06 Kafka consumers.

  session.end -> handle_session_end
    Triggers idempotent STM->LTM consolidation for the completed session.
    Safe to call multiple times — consolidation returns False if already done.
"""
from __future__ import annotations

import asyncio
import logging

from agents.shared.events.consumer import consume
from agents.agt06_memory.consolidation import consolidate_session

logger = logging.getLogger(__name__)


async def handle_session_end(topic: str, event: dict) -> None:
    """
    event fields: sessionId, clerkUserId, skillFocus (optional, defaults SPEAKING).
    Emitted by AGT-03 at session end.
    """
    session_id = event.get("sessionId")
    clerk_user_id = event.get("clerkUserId")
    skill_focus = event.get("skillFocus", "SPEAKING")

    if not session_id or not clerk_user_id:
        logger.warning("handle_session_end: missing sessionId/clerkUserId in %s", event)
        return

    try:
        result = await consolidate_session(session_id, clerk_user_id, skill_focus)
        logger.info(
            "handle_session_end: consolidation result=%s session=%s user=%s",
            result, session_id, clerk_user_id,
        )
    except Exception as exc:
        logger.error(
            "handle_session_end: consolidation failed session=%s err=%s",
            session_id, exc,
        )


async def start_consumers() -> list[asyncio.Task]:
    """Launch the session.end consumer as a background task."""
    return [
        asyncio.create_task(
            consume(["session.end"], "agt06-session-end", handle_session_end)
        ),
    ]

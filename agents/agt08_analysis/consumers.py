"""
AGT-08 Kafka consumers.

  agent.consolidation.complete -> handle_consolidation_complete
    Triggers pattern analysis for the user whose session was just consolidated.
    At-least-once delivery — run_analysis is idempotent (reads, analyses, emits).
"""
from __future__ import annotations

import asyncio
import logging

from agents.shared.events.consumer import consume
from agents.agt08_analysis.service import run_analysis

logger = logging.getLogger(__name__)


async def handle_consolidation_complete(topic: str, event: dict) -> None:
    """
    event fields: clerkUserId (required), sessionId (optional, for logging).
    Emitted by AGT-06 after STM→LTM consolidation succeeds.
    """
    clerk_user_id = event.get("clerkUserId")
    if not clerk_user_id:
        logger.warning("handle_consolidation_complete: missing clerkUserId in %s", event)
        return

    try:
        result = await run_analysis(clerk_user_id)
        logger.info(
            "handle_consolidation_complete: analysis done user=%s patterns=%d",
            clerk_user_id, len(result.get("patterns", [])),
        )
    except Exception as exc:
        logger.error(
            "handle_consolidation_complete: analysis failed user=%s err=%s",
            clerk_user_id, exc,
        )


async def start_consumers() -> list[asyncio.Task]:
    """Launch the consolidation consumer as a background task."""
    return [
        asyncio.create_task(
            consume(
                ["agent.consolidation.complete"],
                "agt08-consolidation-complete",
                handle_consolidation_complete,
            )
        ),
    ]

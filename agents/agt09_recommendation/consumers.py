"""
AGT-09 Kafka consumers.

  agent.pattern.events -> handle_pattern_event
    Invalidates the recommendation cache when a new pattern is detected for a user.
    The next GET /recommendations call will recompute fresh recommendations.
"""
from __future__ import annotations

import asyncio
import logging

from agents.shared.events.consumer import consume
from agents.agt09_recommendation.service import invalidate_cache

logger = logging.getLogger(__name__)


async def handle_pattern_event(topic: str, event: dict) -> None:
    """
    event fields: clerkUserId (required), type (e.g. persistent_weakness, behavioral_risk).
    Emitted by AGT-08 for any detected pattern.
    """
    clerk_user_id = event.get("clerkUserId")
    if not clerk_user_id:
        logger.warning("handle_pattern_event: missing clerkUserId in %s", event)
        return

    try:
        await invalidate_cache(clerk_user_id)
        logger.info(
            "handle_pattern_event: cache invalidated user=%s event_type=%s",
            clerk_user_id, event.get("type"),
        )
    except Exception as exc:
        logger.error(
            "handle_pattern_event: cache invalidation failed user=%s err=%s",
            clerk_user_id, exc,
        )


async def start_consumers() -> list[asyncio.Task]:
    """Launch the pattern events consumer as a background task."""
    return [
        asyncio.create_task(
            consume(
                ["agent.pattern.events"],
                "agt09-pattern-events",
                handle_pattern_event,
            )
        ),
    ]

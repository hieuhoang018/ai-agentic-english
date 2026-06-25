"""
AGT-02 Kafka consumers.

  agent.pattern.events -> handle_pattern_event
    On persistent_weakness events: triggers a plan regeneration for the user
    so the learning path is adapted to address the newly detected weakness.
    Other event types (behavioral_risk, etc.) are logged but ignored — they
    are handled by AGT-10 and AGT-09 respectively.
"""
from __future__ import annotations

import asyncio
import logging

from agents.shared.events.consumer import consume
from agents.agt02_learning_path import service

logger = logging.getLogger(__name__)


async def handle_pattern_event(topic: str, event: dict) -> None:
    """
    event fields: type (required), clerkUserId (required), pattern (optional).
    Emitted by AGT-08 for any detected pattern.
    """
    event_type = event.get("type")
    clerk_user_id = event.get("clerkUserId")

    if not clerk_user_id:
        logger.warning("handle_pattern_event: missing clerkUserId in %s", event)
        return

    if event_type != "persistent_weakness":
        logger.debug("handle_pattern_event: ignoring event type=%s user=%s", event_type, clerk_user_id)
        return

    try:
        result = await service.generate_plan(clerk_user_id, {})
        logger.info(
            "handle_pattern_event: plan regenerated user=%s plan_id=%s",
            clerk_user_id, result.get("plan_id"),
        )
    except Exception as exc:
        logger.error(
            "handle_pattern_event: plan regeneration failed user=%s err=%s",
            clerk_user_id, exc,
        )


async def start_consumers() -> list[asyncio.Task]:
    """Launch the pattern events consumer as a background task."""
    return [
        asyncio.create_task(
            consume(
                ["agent.pattern.events"],
                "agt02-pattern-events",
                handle_pattern_event,
            )
        ),
    ]

"""
AGT-09 Kafka consumers.

  agent.plan.events -> handle_plan_event
    Invalidates the per-user recommendation cache whenever AGT-02 generates
    a new plan (including when triggered by AGT-08 persistent_weakness events).
    Ensures stale recommendations are not served after a replan.
"""
from __future__ import annotations

import asyncio
import logging

from agents.shared.events.consumer import consume
from agents.agt09_recommendation import service

logger = logging.getLogger(__name__)


async def handle_plan_event(topic: str, event: dict) -> None:
    """
    event fields: planId (optional), clerkUserId (required), version (optional).
    Emitted by AGT-02 after every successful plan generation.
    """
    clerk_user_id = event.get("clerkUserId")
    if not clerk_user_id:
        logger.warning("handle_plan_event: missing clerkUserId in %s", event)
        return

    try:
        await service.invalidate_cache(clerk_user_id)
        logger.info(
            "handle_plan_event: cache invalidated user=%s plan_id=%s",
            clerk_user_id, event.get("planId"),
        )
    except Exception as exc:
        logger.error("handle_plan_event: cache invalidation failed user=%s err=%s", clerk_user_id, exc)


async def start_consumers() -> list[asyncio.Task]:
    """Launch the plan events consumer as a background task."""
    return [
        asyncio.create_task(
            consume(
                ["agent.plan.events"],
                "agt09-plan-events",
                handle_plan_event,
            )
        ),
    ]

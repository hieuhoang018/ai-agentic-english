"""
AGT-01 Kafka consumers.

Two background consumer loops, started from main.py's lifespan:

  session.end -> handle_session_end
    Updates behavioral_profile.avg_session_length via EWMA (agt01_profiling.behavioral)
    and clears cold_start_flag once a session has completed.

  agent.errors -> handle_error_event
    Persists cumulative severity into LTM grammar_error_map[skillDomain][errorType].
    This is the long-term counterpart to the per-session STM deltas that
    service.get_profile() merges in-memory on read.

Both handlers are idempotent at-least-once consumers: re-processing the same
event re-applies the same EWMA/sum update, which is acceptable drift for this
sprint (exact-once dedup is a later-phase concern).
"""

from __future__ import annotations

import asyncio
import logging

from agents.shared.db.redis_client import get_redis
from agents.shared.events.consumer import consume
from agents.agt01_profiling.service import update_profile, _get_base_profile
from agents.agt01_profiling.behavioral import update_behavioral_profile

logger = logging.getLogger(__name__)


async def handle_session_end(topic: str, event: dict) -> None:
    """
    event fields used: clerkUserId, durationMinutes (minutes, float), sessionId.
    Emitted by AGT-03's end_session.
    """
    clerk_user_id = event.get("clerkUserId")
    duration = event.get("durationMinutes")
    session_id = event.get("sessionId")

    if not clerk_user_id or duration is None:
        logger.warning("handle_session_end: missing clerkUserId/durationMinutes in %s", event)
        return

    # Idempotency: atomic SET NX EX — if the key already exists, skip.
    # Using SET NX prevents the TOCTOU race of a separate GET + SET.
    if session_id:
        r = await get_redis()
        dedup_key = f"agt01:processed:session_end:{session_id}"
        was_set = await r.set(dedup_key, b"1", nx=True, ex=86400)
        if not was_set:
            logger.info("handle_session_end: already processed session %s, skipping", session_id)
            return

    profile = await _get_base_profile(clerk_user_id)
    updated_behavioral = update_behavioral_profile(
        profile.get("behavioral_profile") or {}, float(duration)
    )
    await update_profile(clerk_user_id, {
        "behavioral_profile": updated_behavioral,
        "cold_start_flag": False,
    })

    logger.info("handle_session_end: updated behavioral profile for %s", clerk_user_id)


async def handle_error_event(topic: str, event: dict) -> None:
    """
    event shape: {"sessionId": ..., "clerkUserId": ..., "error": {...}}.
    Emitted by AGT-04 as the Kafka half of its dual-write (the STM half is
    AGT-06's session:{id}:errors list, read directly by service.get_profile).
    The nested "error" dict uses snake_case keys: error_type, skill_domain,
    severity (see agents/shared/models/learner.py ErrorEvent).
    """
    clerk_user_id = event.get("clerkUserId")
    if not clerk_user_id:
        logger.warning("handle_error_event: missing clerkUserId in %s", event)
        return

    error = event.get("error") or {}
    skill_domain = error.get("skill_domain", "SPEAKING")
    error_type = error.get("error_type", "unknown")
    severity = float(error.get("severity", 1))

    profile = await _get_base_profile(clerk_user_id)
    grammar_map = dict(profile.get("grammar_error_map") or {})
    skill_map = dict(grammar_map.get(skill_domain, {}))
    skill_map[error_type] = skill_map.get(error_type, 0.0) + severity
    grammar_map[skill_domain] = skill_map

    await update_profile(clerk_user_id, {"grammar_error_map": grammar_map})
    logger.info(
        "handle_error_event: updated grammar_error_map for %s skill=%s type=%s severity=%s",
        clerk_user_id, skill_domain, error_type, severity,
    )


async def start_consumers() -> list[asyncio.Task]:
    """
    Launch both consumer loops as background tasks and return them so
    main.py's lifespan can cancel them on shutdown.
    """
    return [
        asyncio.create_task(
            consume(["session.end"], "agt01-session-end", handle_session_end)
        ),
        asyncio.create_task(
            consume(["agent.errors"], "agt01-error-events", handle_error_event)
        ),
    ]

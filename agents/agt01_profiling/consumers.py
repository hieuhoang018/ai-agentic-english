"""
AGT-01 Kafka consumers.

Two background consumer loops, started from main.py's lifespan:

  session.end -> handle_session_end
    Updates IRT theta for skill_focus (score derived from session error count
    fetched from AGT-06 STM) and behavioral_profile.avg_session_length via EWMA.
    Clears cold_start_flag once a session has completed.

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
import os

import httpx

from agents.shared.db.redis_client import get_redis
from agents.shared.events.consumer import consume
from agents.agt01_profiling.service import update_profile, _get_base_profile
from agents.agt01_profiling.behavioral import update_behavioral_profile
from agents.agt01_profiling import irt

logger = logging.getLogger(__name__)

AGT06_BASE_URL = os.environ.get("AGT06_BASE_URL", "http://agt06-memory:8106")

# First character of skill_focus string → IRT theta dict key
_SKILL_TO_THETA_KEY: dict[str, str] = {"S": "S", "L": "L", "R": "R", "W": "W"}


async def _get_session_error_count(session_id: str) -> int:
    """
    Fetch the error count for a session from AGT-06 STM.
    Best-effort — returns 0 on any failure so the IRT update still proceeds.
    """
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{AGT06_BASE_URL}/sessions/{session_id}/errors")
            resp.raise_for_status()
            return len(resp.json())
    except Exception as exc:
        logger.warning(
            "handle_session_end: AGT-06 error fetch failed session=%s err=%s", session_id, exc
        )
        return 0


def _session_score(num_errors: int) -> float:
    """
    Derive a [0.1, 1.0] session performance score from error count.
    0 errors → 1.0 (perfect); each error subtracts 0.1; floor at 0.1.
    """
    return max(0.1, 1.0 - num_errors * 0.1)


async def handle_session_end(topic: str, event: dict) -> None:
    """
    event fields used: clerkUserId, durationMinutes (float), sessionId, skillFocus.
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

    updates: dict = {
        "behavioral_profile": updated_behavioral,
        "cold_start_flag": False,
    }

    # IRT theta update: score derived from session error count, MAP approximation applied.
    # Best-effort — failure here must not block the behavioral update above.
    skill_focus = str(event.get("skillFocus") or "SPEAKING").upper()
    skill_key = _SKILL_TO_THETA_KEY.get(skill_focus[0], "S")
    try:
        num_errors = await _get_session_error_count(session_id) if session_id else 0
        score = _session_score(num_errors)
        theta = dict(
            profile.get("irt_theta") or {"L": 0.0, "S": 0.0, "R": 0.0, "W": 0.0}
        )
        theta[skill_key] = irt.update_theta(float(theta.get(skill_key, 0.0)), score)
        updates["irt_theta"] = theta
    except Exception as exc:
        logger.warning(
            "handle_session_end: IRT theta update failed user=%s err=%s", clerk_user_id, exc
        )

    await update_profile(clerk_user_id, updates)

    logger.info(
        "handle_session_end: updated profile for %s skill=%s irt_theta=%s",
        clerk_user_id, skill_focus, updates.get("irt_theta"),
    )


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

"""
Assessment Agent service layer.
Manages CAT sessions: start, respond, terminate, produce results.

At scaffold: sequential item delivery with stub theta estimation.
Full 3PL IRT + Fisher information maximisation deferred to Phase 8+.
"""

import json
import uuid
import httpx
import logging
from agents.agt05_assessment.cat_engine import (
    estimate_theta_stub, select_next_item_stub, should_terminate
)
from agents.shared.config import settings
from agents.shared.db.postgres import execute
from agents.shared.db.redis_client import get_redis
from agents.shared.cefr import theta_to_cefr

logger = logging.getLogger(__name__)

LMS_BASE = settings.LMS_BASE_URL


_ITEM_BANK_TTL = 300
_ITEM_BANK_KEY = "agt05:item_bank:{}"


async def _fetch_lms_items(skill_domain: str) -> list[dict]:
    """Raw HTTP fetch from Learning Materials Service — no caching."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{LMS_BASE}/assessment/item-bank",
                params={"skill": skill_domain},
            )
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        logger.warning("Could not fetch item bank for %s: %s", skill_domain, exc)
        return []


async def _fetch_item_bank(skill_domain: str) -> list[dict]:
    """
    Fetch assessment items with a 300-second Redis cache.
    Cache miss: call LMS and store result (only if non-empty).
    Cache hit: deserialize and return without calling LMS.
    """
    redis = await get_redis()
    key = _ITEM_BANK_KEY.format(skill_domain)
    try:
        cached = await redis.get(key)
        if cached is not None:
            return json.loads(cached)
    except Exception as exc:
        logger.warning("Redis get failed for %s: %s — falling through to LMS", key, exc)

    items = await _fetch_lms_items(skill_domain)
    if items:
        try:
            await redis.set(key, json.dumps(items), ex=_ITEM_BANK_TTL)
        except Exception as exc:
            logger.warning("Redis set failed for %s: %s — cache not populated", key, exc)
    return items


async def start_assessment(clerk_user_id: str, skill_domain: str) -> dict:
    """Start a new CAT assessment session. Returns the first item."""
    if skill_domain == "SPEAKING":
        return {
            "error": "Speaking is not assessed via CAT.",
            "detail": "Speaking proficiency is inferred from session performance over time.",
            "skill_domain": "SPEAKING",
            "http_status": 422,
        }
    item_bank = await _fetch_item_bank(skill_domain)
    if not item_bank:
        return {
            "error": "Item bank unavailable",
            "skill_domain": skill_domain,
        }

    theta = 0.0  # start at midpoint
    first_item = select_next_item_stub(theta, [], item_bank)
    if not first_item:
        return {"error": "No items available", "skill_domain": skill_domain}

    return {
        "assessment_id": f"{clerk_user_id}_{skill_domain}_{uuid.uuid4().hex[:8]}",
        "skill_domain": skill_domain,
        "current_item": first_item,
        "items_answered": 0,
        "current_theta": theta,
        "terminated": False,
    }


async def record_response(
    assessment_id: str,
    item_id: str,
    correct: bool,
    prior_responses: list[dict],
    skill_domain: str,
    clerk_user_id: str,
) -> dict:
    """Record a response and return the next item or termination result."""
    responses = prior_responses + [{"item_id": item_id, "correct": correct}]
    theta = estimate_theta_stub(responses)

    if should_terminate(responses):
        return await _terminate(assessment_id, clerk_user_id, skill_domain, responses, theta)

    item_bank = await _fetch_item_bank(skill_domain)
    answered_ids = [r["item_id"] for r in responses]
    next_item = select_next_item_stub(theta, answered_ids, item_bank)

    if next_item is None:
        # Item bank exhausted before 30-item threshold — still a terminal state.
        return await _terminate(assessment_id, clerk_user_id, skill_domain, responses, theta)

    return {
        "assessment_id": assessment_id,
        "skill_domain": skill_domain,
        "current_item": next_item,
        "items_answered": len(responses),
        "current_theta": theta,
        "terminated": False,
    }


async def _terminate(
    assessment_id: str,
    clerk_user_id: str,
    skill_domain: str,
    responses: list[dict],
    theta: float,
) -> dict:
    """Persist assessment result and return the terminal response shape."""
    cefr = theta_to_cefr(theta)
    try:
        await execute(
            """INSERT INTO assessment_history
               (clerk_user_id, skill_domain, item_id, response, irt_score, cefr_band)
               VALUES ($1, $2, $3, $4::jsonb, $5, $6)""",
            clerk_user_id,
            skill_domain,
            assessment_id,
            json.dumps(responses),
            theta,
            cefr,
        )
    except Exception as exc:
        logger.error(
            "Postgres write failed for assessment %s: %s — result not persisted",
            assessment_id, exc,
        )
    return {
        "assessment_id": assessment_id,
        "skill_domain": skill_domain,
        "terminated": True,
        "items_answered": len(responses),
        "final_theta": theta,
        "cefr_band": cefr,
        "confidence_interval": [round(theta - 0.5, 3), round(theta + 0.5, 3)],
    }

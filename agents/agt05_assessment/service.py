"""
Assessment Agent service layer.
Manages CAT sessions: start, respond, terminate, produce results.

Theta estimation, item selection, and termination are delegated to the real
1PL (Rasch) EAP psychometrics in cat_engine.py. True 3PL IRT (discrimination
and guessing parameters) remains deferred to Phase 8+ pending calibration data.
"""

import json
import uuid
import httpx
import logging
from agents.agt05_assessment.cat_engine import (
    estimate_theta_eap, select_next_item_eap, should_terminate_eap
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
                params={"skill": skill_domain.lower()},
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

    theta = 0.0  # start at midpoint, matches the EAP prior mean
    first_item = select_next_item_eap(theta, [], item_bank)
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
    item_bank = await _fetch_item_bank(skill_domain)
    current_difficulty = next(
        (i["difficulty_param"] for i in item_bank if i["item_id"] == item_id),
        0.0,  # fallback: item not found in current bank fetch (e.g. cache raced
              # with a bank update) — 0.0 is the prior mean, a neutral default
              # rather than crashing the whole assessment turn.
    )
    responses = prior_responses + [
        {"item_id": item_id, "difficulty_param": current_difficulty, "correct": correct}
    ]
    theta = estimate_theta_eap(responses)

    if should_terminate_eap(responses, theta, item_bank_size=len(item_bank)):
        return await _terminate(assessment_id, clerk_user_id, skill_domain, responses, theta)

    answered_ids = [r["item_id"] for r in responses]
    next_item = select_next_item_eap(theta, answered_ids, item_bank)

    if next_item is None:
        # Item bank exhausted before the SE/max_items threshold — still terminal.
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
    first_item_id = responses[0]["item_id"] if responses else None
    try:
        await execute(
            """INSERT INTO assessment_history
               (clerk_user_id, skill_domain, item_id, assessment_session_id, response, irt_score, cefr_band)
               VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)""",
            clerk_user_id,
            skill_domain,
            first_item_id,
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

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


async def _fetch_item_bank(skill_domain: str) -> list[dict]:
    """
    Fetch assessment items for a skill domain from Learning Materials Service.
    Returns items with IRT parameters (b, a, c).
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{LMS_BASE}/assessment/questions",
                params={"skill": skill_domain},
            )
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        logger.warning("Could not fetch item bank for %s: %s", skill_domain, exc)
        return []


async def start_assessment(clerk_user_id: str, skill_domain: str) -> dict:
    """Start a new CAT assessment session. Returns the first item."""
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
        cefr = theta_to_cefr(theta)
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
        return {
            "assessment_id": assessment_id,
            "skill_domain": skill_domain,
            "terminated": True,
            "items_answered": len(responses),
            "final_theta": theta,
            "cefr_band": cefr,
            "confidence_interval": [round(theta - 0.5, 3), round(theta + 0.5, 3)],
        }

    item_bank = await _fetch_item_bank(skill_domain)
    answered_ids = [r["item_id"] for r in responses]
    next_item = select_next_item_stub(theta, answered_ids, item_bank)

    return {
        "assessment_id": assessment_id,
        "skill_domain": skill_domain,
        "current_item": next_item,
        "items_answered": len(responses),
        "current_theta": theta,
        "terminated": next_item is None,
    }

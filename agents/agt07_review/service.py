"""
Review Generation Agent service layer.
Fetches LTM data from AGT-06 and builds review schedules and tests.
"""

import httpx
import logging
from datetime import datetime, timezone
from agents.agt07_review.sm2 import compute_retrievability, next_review_date_stub, update_stability_stub
from agents.agt07_review.test_builder import compose_test_stub

logger = logging.getLogger(__name__)

AGT06_BASE = "http://agt06-memory:8106"


async def get_due_items(clerk_user_id: str) -> list[dict]:
    """
    Return vocabulary items due for review (retrievability below threshold).
    Ordered by retrievability ascending (most urgent first).
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{AGT06_BASE}/ltm/{clerk_user_id}/vocabulary")
            r.raise_for_status()
            vocab = r.json()
    except Exception as exc:
        logger.warning("Could not fetch vocab for %s: %s", clerk_user_id, exc)
        return []

    now = datetime.now(timezone.utc)
    due = []
    for item in vocab:
        last = item.get("last_encounter")
        if last is None:
            days_since = 999.0
        else:
            try:
                last_dt = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
                days_since = (now - last_dt).total_seconds() / 86400
            except Exception:
                days_since = 999.0
        stability = item.get("sm_stability", 1.0)
        r_val = compute_retrievability(stability, days_since)
        if r_val < 0.9:
            due.append({**item, "retrievability": r_val, "days_since": round(days_since, 1)})

    due.sort(key=lambda x: x["retrievability"])
    return due


async def rate_item(clerk_user_id: str, item_id: str, quality: int) -> dict:
    """
    Record a review rating for a vocabulary item. Updates SM-2 state.
    quality: 0-5 (0-2 = forgotten, 3+ = recalled)
    """
    # TODO Phase 8+: read current SM-2 state from LTM, apply full update
    return {
        "item_id": item_id,
        "quality": quality,
        "next_review": next_review_date_stub(quality, 1.0).isoformat(),
        "stub": True,
    }


async def build_daily_test(clerk_user_id: str, size: int = 10) -> list[dict]:
    """Build a personalised daily review test from LTM error history and vocab."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            vocab_r = await client.get(f"{AGT06_BASE}/ltm/{clerk_user_id}/vocabulary", params={"limit": 50})
            errors_r = await client.get(f"{AGT06_BASE}/ltm/{clerk_user_id}/errors", params={"limit": 50})
            vocab_r.raise_for_status()
            errors_r.raise_for_status()
            vocab = vocab_r.json()
            errors = errors_r.json()
    except Exception as exc:
        logger.warning("Could not build test for %s: %s", clerk_user_id, exc)
        return []

    return compose_test_stub(vocab, errors, size)

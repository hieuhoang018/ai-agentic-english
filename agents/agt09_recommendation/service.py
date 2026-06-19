"""
Recommendation Agent service.
Pre-computes recommendations and caches in Redis per user.
Cold-start: popularity-based fallback when cold_start_flag=True.
"""

import json
import httpx
import logging
from agents.agt09_recommendation.scorer import score_items
from agents.shared.db.redis_client import get_redis

logger = logging.getLogger(__name__)

AGT01_BASE = "http://agt01-profiling:8101"
LMS_BASE = "http://learning-materials-service:4002"
CACHE_TTL = 3600  # 1 hour


async def get_recommendations(clerk_user_id: str) -> list[dict]:
    """
    Return recommendations for a user. Cache-first.
    Falls back to cold-start popularity list when cold_start_flag=True.
    """
    r = await get_redis()
    cache_key = f"reco:{clerk_user_id}"
    cached = await r.get(cache_key)
    if cached:
        return json.loads(cached)

    return await _compute_recommendations(clerk_user_id)


async def _compute_recommendations(clerk_user_id: str) -> list[dict]:
    """Compute fresh recommendations, write to cache, return."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            profile_r = await client.get(f"{AGT01_BASE}/profile/{clerk_user_id}")
            catalog_r = await client.get(f"{LMS_BASE}/modules")
            profile_r.raise_for_status()
            catalog_r.raise_for_status()
            profile = profile_r.json()
            modules = catalog_r.json()
    except Exception as exc:
        logger.warning("Recommendation data fetch failed for %s: %s", clerk_user_id, exc)
        return _cold_start_fallback()

    if profile.get("cold_start_flag", True):
        recs = _cold_start_fallback()
    else:
        candidates = [
            {"id": m["id"], "title": m["title"], "difficulty": 0.5,
             "skillDomain": m.get("skillDomain", "READING"), "cefrLevel": m.get("cefrLevel", "B1")}
            for m in modules
        ]
        recs = score_items(candidates, profile, [])

    r = await get_redis()
    await r.setex(f"reco:{clerk_user_id}", CACHE_TTL, json.dumps(recs))
    return recs


def _cold_start_fallback() -> list[dict]:
    """Return placeholder recommendations for new users."""
    return [
        {"id": "stub-1", "title": "Business Email Writing", "skillDomain": "WRITING",
         "rationale": "Popular starting point for professionals.", "cold_start": True},
        {"id": "stub-2", "title": "Meeting English Phrases", "skillDomain": "SPEAKING",
         "rationale": "Most requested content for working adults.", "cold_start": True},
        {"id": "stub-3", "title": "Listening: Conference Calls", "skillDomain": "LISTENING",
         "rationale": "Common professional scenario.", "cold_start": True},
    ]


async def invalidate_cache(clerk_user_id: str) -> None:
    """Invalidate cached recommendations (called on re-plan events)."""
    r = await get_redis()
    await r.delete(f"reco:{clerk_user_id}")

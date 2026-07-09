"""
Recommendation Agent service.
Pre-computes recommendations and caches in Redis per user.
Cold-start: popularity-based fallback when cold_start_flag=True.
"""

import asyncio
import json
import time
import httpx
import logging
from agents.agt09_recommendation.scorer import score_items
from agents.shared.db.redis_client import get_redis

logger = logging.getLogger(__name__)

AGT01_BASE = "http://agt01-profiling:8101"
LMS_BASE = "http://learning-materials-service:4002"
CACHE_TTL = 3600  # 1 hour

# Novelty filter: no other agent retains a "recently completed/seen" history
# for a user's items, so AGT-09 tracks its own served-item history in Redis
# and treats "recommended in the last 14 days" as "recently seen".
RECENTLY_SEEN_TTL_SECONDS = 14 * 24 * 3600

# LMS modules carry no numeric difficulty field (only per-exercise difficulty
# exists in the catalog), so CEFR level is used as the real per-item proxy.
# Two modules at the same CEFR level get an identical difficulty score, so
# scorer.py's ranking within a level is arbitrary (stable-sort order), not
# a meaningful distinction.
_CEFR_DIFFICULTY = {
    "A1": 0.0, "A2": 0.2, "B1": 0.4, "B2": 0.6, "C1": 0.8, "C2": 1.0,
}


def _cefr_to_difficulty(cefr_level: str) -> float:
    return _CEFR_DIFFICULTY.get(cefr_level, 0.5)


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
    r = await get_redis()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            profile_r, catalog_r = await asyncio.gather(
                client.get(f"{AGT01_BASE}/profile/{clerk_user_id}"),
                client.get(f"{LMS_BASE}/modules"),
            )
            profile_r.raise_for_status()
            catalog_r.raise_for_status()
            profile = profile_r.json()
            modules = catalog_r.json()
    except Exception as exc:
        logger.warning("Recommendation data fetch failed for %s: %s", clerk_user_id, exc)
        return _unreachable_fallback()

    if profile.get("cold_start_flag", True):
        if modules:
            recs = [
                {
                    "id": m["id"],
                    "title": m["title"],
                    "skillDomain": m.get("skillFocus", "READING"),
                    "cefrLevel": m.get("cefrLevel", "A1"),
                    "rationale": "Popular starting point for new learners.",
                    "cold_start": True,
                }
                for m in modules[:min(3, len(modules))]
            ]
        else:
            recs = _unreachable_fallback()
    else:
        candidates = [
            {"id": m["id"], "title": m["title"],
             "difficulty": _cefr_to_difficulty(m.get("cefrLevel", "B1")),
             "skillDomain": m.get("skillFocus", "READING"), "cefrLevel": m.get("cefrLevel", "B1")}
            for m in modules
        ]
        try:
            recently_seen = await _get_recently_seen_ids(r, clerk_user_id)
        except Exception as exc:
            logger.warning("Recently-seen lookup failed for %s: %s", clerk_user_id, exc)
            recently_seen = []

        recs = score_items(candidates, profile, recently_seen)

        try:
            await _record_seen_ids(r, clerk_user_id, [item["id"] for item in recs])
        except Exception as exc:
            logger.warning("Recently-seen recording failed for %s: %s", clerk_user_id, exc)

    await r.set(f"reco:{clerk_user_id}", json.dumps(recs), ex=CACHE_TTL)
    return recs


async def _get_recently_seen_ids(r, clerk_user_id: str) -> list[str]:
    """Return item ids recommended to this user within the last 14 days."""
    key = f"reco:seen:{clerk_user_id}"
    cutoff = time.time() - RECENTLY_SEEN_TTL_SECONDS
    await r.zremrangebyscore(key, "-inf", cutoff)
    ids = await r.zrange(key, 0, -1)
    return [item_id.decode() if isinstance(item_id, bytes) else item_id for item_id in ids]


async def _record_seen_ids(r, clerk_user_id: str, item_ids: list[str]) -> None:
    """Record served item ids with the current timestamp, refreshing the 14-day TTL."""
    if not item_ids:
        return
    key = f"reco:seen:{clerk_user_id}"
    now = time.time()
    await r.zadd(key, {item_id: now for item_id in item_ids})
    await r.expire(key, RECENTLY_SEEN_TTL_SECONDS)


def _unreachable_fallback() -> list[dict]:
    """Return placeholder recommendations when AGT-01 or LMS is unreachable, or modules list is empty."""
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

"""
Exercise library four-tab assembly for the PWA.

Tabs (in order):
  1. Today's Plan    — from AGT-02 /plans/{userId}/today
  2. Due for Review  — from AGT-07 /schedule/{userId}/due
  3. Recommended     — from AGT-09 /recommendations/{userId}
  4. Browse          — from Learning Materials Service /modules

Each tab fetched independently. Partial failures return empty tab, not 500.
asyncio.gather with return_exceptions=True ensures resilience.
"""

import asyncio
import httpx
import logging

from agents.shared.config import settings

logger = logging.getLogger(__name__)

AGT02_BASE = "http://agt02-learning-path:8102"
AGT07_BASE = "http://agt07-review:8107"
AGT09_BASE = "http://agt09-recommendation:8109"
LMS_BASE = "http://learning-materials-service:4002"

_AGT02_HEADERS = {"x-internal-secret": settings.INTERNAL_SECRET}


async def _fetch(url: str, headers: dict | None = None) -> list | dict | None:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(url, headers=headers)
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        logger.warning("Library tab fetch failed url=%s error=%s", url, exc)
        return None


async def get_exercise_library(clerk_user_id: str, headers: dict | None = None) -> dict:
    """
    Assemble all four tabs in parallel.
    Any tab that fails returns an empty list — never blocks the others.
    `headers` forwards the caller's bearer token to AGT-09's
    /recommendations/{clerk_user_id}, which now requires it to match
    clerk_user_id (see agents/shared/auth/clerk.py).
    """
    results = await asyncio.gather(
        # AGT-02 requires x-internal-secret (see agt02_learning_path/main.py's
        # verify_internal_secret); the caller's own bearer token is forwarded
        # alongside it in case AGT-02 later validates caller identity too.
        _fetch(f"{AGT02_BASE}/plans/{clerk_user_id}/today", headers={**_AGT02_HEADERS, **(headers or {})}),
        _fetch(f"{AGT07_BASE}/schedule/{clerk_user_id}/due", headers),
        _fetch(f"{AGT09_BASE}/recommendations/{clerk_user_id}", headers),
        _fetch(f"{LMS_BASE}/modules", headers),
        return_exceptions=True,
    )

    def safe(r):
        if isinstance(r, (Exception, type(None))):
            return []
        return r if isinstance(r, list) else [r]

    return {
        "todaysPlan":   safe(results[0]),
        "dueForReview": safe(results[1]),
        "recommended":  safe(results[2]),
        "browse":       safe(results[3]),
    }

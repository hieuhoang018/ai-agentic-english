"""
Review Generation Agent service layer.
Fetches LTM data from AGT-06 and builds review schedules and tests.
"""

import httpx
import logging
from datetime import datetime, timezone
from agents.agt07_review.sm2 import compute_retrievability, next_review_date_stub, update_stability_stub
from agents.agt07_review.test_builder import compose_test_stub
from agents.shared.config import settings
from agents.shared.db.postgres import fetchrow, execute

logger = logging.getLogger(__name__)

AGT06_BASE = settings.AGT06_BASE_URL
LMS_BASE = settings.LMS_BASE_URL


async def _lookup_meaning(word: str) -> str:
    """Best-effort definition lookup against the vocab spine on learning-materials-service."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                f"{LMS_BASE}/internal/vocab",
                params={"lemma": word, "limit": 1},
                headers={"x-internal-secret": settings.INTERNAL_SECRET},
            )
            r.raise_for_status()
            entries = r.json()
    except Exception as exc:
        logger.warning("Could not look up meaning for word=%s: %s", word, exc)
        return ""

    if not entries or not entries[0].get("senses"):
        return ""
    return entries[0]["senses"][0].get("definition", "")


async def fetch_vocabulary(clerk_user_id: str, limit: int | None = None) -> list[dict]:
    """
    Fetch a user's vocabulary from AGT-06. Shared by get_due_items and
    pick_vocab_of_the_day so callers that need both (e.g. reminder_context)
    can fetch once and pass the result to both instead of hitting AGT-06's
    /ltm/{id}/vocabulary endpoint twice for largely overlapping data.
    Returns [] on any fetch failure (best-effort, same as before).
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            params = {"limit": limit} if limit is not None else None
            r = await client.get(f"{AGT06_BASE}/ltm/{clerk_user_id}/vocabulary", params=params)
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        logger.warning("Could not fetch vocab for %s: %s", clerk_user_id, exc)
        return []


async def get_due_items(clerk_user_id: str, vocab: list[dict] | None = None) -> list[dict]:
    """
    Return vocabulary items due for review (retrievability below threshold).
    Ordered by retrievability ascending (most urgent first).
    Pass a pre-fetched `vocab` (e.g. from fetch_vocabulary) to avoid an extra
    AGT-06 round-trip when the caller also needs pick_vocab_of_the_day.
    """
    if vocab is None:
        vocab = await fetch_vocabulary(clerk_user_id)

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


async def rate_item(
    clerk_user_id: str,
    item_id: str,
    quality: int,
    reviewed_at: datetime | None = None,
) -> dict:
    """
    Record a review rating for a vocabulary item.
    Reads current sm_stability from DB, computes updated stability and next
    review date via SM-2 stubs, and writes both back to vocabulary_mastery.
    quality: 0-5 (0-2 = forgotten, 3+ = recalled).
    reviewed_at: if provided (offline replay), anchors next_review_at to that
    timestamp instead of now().
    """
    row = await fetchrow(
        "SELECT sm_stability FROM vocabulary_mastery "
        "WHERE vocab_id = $1::uuid AND clerk_user_id = $2",
        item_id, clerk_user_id,
    )
    if row is None:
        raise ValueError(f"Vocab item {item_id!r} not found for user {clerk_user_id!r}")
    current_stability = float(row["sm_stability"])

    new_stability = update_stability_stub(quality, current_stability)
    next_review = next_review_date_stub(quality, new_stability, base_time=reviewed_at)

    await execute(
        "UPDATE vocabulary_mastery "
        "SET sm_stability = $1, next_review_at = $2 "
        "WHERE vocab_id = $3::uuid AND clerk_user_id = $4",
        new_stability, next_review, item_id, clerk_user_id,
    )

    return {
        "item_id": item_id,
        "quality": quality,
        "new_stability": round(new_stability, 4),
        "next_review": next_review.isoformat(),
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


async def pick_vocab_of_the_day(clerk_user_id: str, vocab: list[dict] | None = None) -> dict | None:
    """
    Return the least-familiar vocab item, for the daily-reminder job.
    Returns None if the user has no vocab or AGT-06 is unreachable.
    Pass a pre-fetched `vocab` (e.g. from fetch_vocabulary) to avoid an extra
    AGT-06 round-trip when the caller also needs get_due_items.
    """
    if vocab is None:
        vocab = await fetch_vocabulary(clerk_user_id, limit=50)

    if not vocab:
        return None

    item = min(vocab, key=lambda v: v.get("encounter_count", 0))
    return {
        "vocabItemId": item["vocab_id"],
        "term": item["word"],
        "meaning": await _lookup_meaning(item["word"]),
        "exampleSentence": item["context_sentences"][0] if item.get("context_sentences") else None,
    }

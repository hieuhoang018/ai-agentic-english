"""
Offline package assembly and sync replay for AGT-07.

GET /offline/{clerk_user_id}/package  — build a self-contained review bundle the
    client can cache and use without network access.

POST /offline/{clerk_user_id}/sync    — replay queued review ratings through the
    same SM-2 logic as online rating, producing identical state.
"""

import asyncio
import httpx
import logging
from datetime import datetime, timezone

from agents.shared.config import settings
from agents.shared.db.postgres import fetch, execute
from agents.agt07_review.service import get_due_items, rate_item

logger = logging.getLogger(__name__)


async def get_offline_package(clerk_user_id: str) -> dict:
    """
    Assemble an offline review package.
    Returns:
      flashcards_due   — vocab items below the R=0.9 retrievability threshold,
                         sorted most-urgent first (same as /schedule/.../due).
      sm2_state        — full SM-2 snapshot for every vocab item the user has
                         ever seen, so the client can recompute retrievability
                         locally while offline.
      highlight_snapshot — recent error events from AGT-06 for grammar review
                           hints (best-effort; empty list if AGT-06 unreachable).
    """
    flashcards_due, sm2_state, highlight_snapshot = await asyncio.gather(
        get_due_items(clerk_user_id),
        _get_sm2_state(clerk_user_id),
        _get_highlight_snapshot(clerk_user_id),
    )

    return {
        "clerk_user_id": clerk_user_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "flashcards_due": flashcards_due,
        "sm2_state": sm2_state,
        "highlight_snapshot": highlight_snapshot,
    }


async def _get_sm2_state(clerk_user_id: str) -> list[dict]:
    rows = await fetch(
        """
        SELECT vocab_id, word, sm_stability, sm_retrievability,
               next_review_at, last_encounter, encounter_count
        FROM vocabulary_mastery
        WHERE clerk_user_id = $1
        ORDER BY last_encounter DESC NULLS LAST
        """,
        clerk_user_id,
    )
    return [
        {
            "vocab_id": str(r["vocab_id"]),
            "word": r["word"],
            "sm_stability": float(r["sm_stability"]),
            "sm_retrievability": float(r["sm_retrievability"]),
            "next_review_at": r["next_review_at"].isoformat() if r["next_review_at"] else None,
            "last_encounter": r["last_encounter"].isoformat() if r["last_encounter"] else None,
            "encounter_count": r["encounter_count"],
        }
        for r in rows
    ]


async def _get_highlight_snapshot(clerk_user_id: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{settings.AGT06_BASE_URL}/ltm/{clerk_user_id}/errors",
                params={"limit": 20},
            )
            r.raise_for_status()
            errors = r.json()
    except Exception as exc:
        logger.warning("highlight snapshot unavailable for %s: %s", clerk_user_id, exc)
        errors = []

    return {"recent_errors": errors}


async def _process_one_review(clerk_user_id: str, review: dict) -> tuple[int, int, dict | None]:
    """
    Process a single review through the claim + SM-2 update path.
    Returns (applied_delta, skipped_delta, error_or_None) instead of mutating
    shared counters directly, so this can be safely run concurrently with
    other item groups via asyncio.gather in apply_offline_sync.
    """
    review_id = review.get("review_id")
    item_id = review.get("item_id")
    quality = review.get("quality")
    reviewed_at_raw = review.get("reviewed_at")

    if not review_id or item_id is None or quality is None:
        return 0, 0, {"review_id": review_id, "reason": "missing required fields"}

    # Claim the review_id atomically. "INSERT 0 0" means the row already
    # existed (conflict) — skip without hitting the SM-2 update path.
    # This eliminates the TOCTOU race that a SELECT-then-INSERT pattern has.
    claim_result = await execute(
        "INSERT INTO offline_review_log (review_id, clerk_user_id, item_id) "
        "VALUES ($1, $2, $3) ON CONFLICT (review_id) DO NOTHING",
        review_id, clerk_user_id, item_id,
    )
    if claim_result == "INSERT 0 0":
        return 0, 1, None

    reviewed_at: datetime | None = None
    if reviewed_at_raw:
        try:
            reviewed_at = datetime.fromisoformat(
                str(reviewed_at_raw).replace("Z", "+00:00")
            )
        except ValueError:
            pass

    try:
        await rate_item(clerk_user_id, item_id, quality, reviewed_at=reviewed_at)
    except ValueError as exc:
        # Roll back the log claim so the client can retry after correcting the item.
        await execute(
            "DELETE FROM offline_review_log WHERE review_id = $1",
            review_id,
        )
        return 0, 0, {"review_id": review_id, "reason": str(exc)}

    return 1, 0, None


async def _process_item_sequence(clerk_user_id: str, reviews_for_item: list[dict]) -> list[tuple[int, int, dict | None]]:
    """
    Process one item_id's reviews in order, sequentially. SM-2 state is
    cascading (each rating reads-then-writes sm_stability), so reviews of the
    *same* item must never run concurrently with each other — but this whole
    sequence is independent of every other item's sequence.
    """
    results = []
    for review in reviews_for_item:
        results.append(await _process_one_review(clerk_user_id, review))
    return results


async def apply_offline_sync(clerk_user_id: str, reviews: list[dict]) -> dict:
    """
    Replay offline review ratings through the SM-2 update logic.

    Reviews are processed in ascending reviewed_at order so that multiple
    reviews of the same item produce the same final SM-2 state as the
    equivalent online sequence would have. Reviews for *different* item_ids
    have no such ordering dependency, so each item_id's ordered sub-sequence
    runs as its own coroutine, and those coroutines run concurrently via
    asyncio.gather — only same-item reviews are forced to stay sequential.

    Each review must carry a client-generated review_id (UUID string).
    Already-processed review_ids are skipped — safe to call multiple times
    with the same payload.

    Returns {applied, skipped, errors} where errors contains per-review
    failure details (item not found, missing fields) without aborting the rest.
    """
    sorted_reviews = sorted(
        reviews,
        key=lambda r: r.get("reviewed_at") or "",
    )

    # Group by item_id, preserving each group's reviewed_at-ascending order.
    # Reviews missing an item_id can't be grouped meaningfully (and fail
    # validation immediately in _process_one_review anyway) — each gets its
    # own single-review sequence.
    groups: dict[str, list[dict]] = {}
    ungrouped: list[dict] = []
    for review in sorted_reviews:
        item_id = review.get("item_id")
        if item_id is None:
            ungrouped.append(review)
        else:
            groups.setdefault(item_id, []).append(review)

    sequences = list(groups.values()) + [[r] for r in ungrouped]
    per_item_results = await asyncio.gather(
        *(_process_item_sequence(clerk_user_id, seq) for seq in sequences)
    )

    applied = 0
    skipped = 0
    errors: list[dict] = []
    for results in per_item_results:
        for applied_delta, skipped_delta, error in results:
            applied += applied_delta
            skipped += skipped_delta
            if error is not None:
                errors.append(error)

    return {"applied": applied, "skipped": skipped, "errors": errors}

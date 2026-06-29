import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from agents.agt07_review.service import get_due_items, rate_item, build_daily_test, pick_vocab_of_the_day
from agents.agt07_review.offline import get_offline_package, apply_offline_sync
from agents.shared.config import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="AGT-07: Review Generation Agent",
    version="0.1.0",
    lifespan=lifespan,
)


class RateRequest(BaseModel):
    item_id: str
    quality: int  # 0-5


class OfflineReview(BaseModel):
    review_id: str
    item_id: str
    quality: int = Field(ge=0, le=5)
    reviewed_at: str | None = None  # ISO-8601; used as SM-2 base for replay


class SyncRequest(BaseModel):
    reviews: list[OfflineReview]


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "AGT-07", "name": "Review Generation"}


@app.get("/schedule/{clerk_user_id}/due")
async def due_items(clerk_user_id: str):
    """
    Return vocabulary items due for review, ordered by retrievability ascending.
    TODO Phase 8+: include grammar categories and pronunciation targets.
    """
    return await get_due_items(clerk_user_id)


@app.post("/schedule/{clerk_user_id}/rate")
async def rate(clerk_user_id: str, body: RateRequest):
    """
    Record a review rating and update SM-2 state.
    TODO Phase 8+: full SM-2 stability/retrievability update.
    """
    try:
        return await rate_item(clerk_user_id, body.item_id, body.quality)
    except ValueError:
        raise HTTPException(status_code=404, detail="Vocab item not found")


@app.get("/tests/{clerk_user_id}/daily")
async def daily_test(clerk_user_id: str, size: int = 10):
    """
    Build a personalised daily review test.
    TODO Phase 8+: 40/30/20/10 composition with format mirroring.
    """
    return await build_daily_test(clerk_user_id, size)


@app.get("/offline/{clerk_user_id}/package")
async def offline_package(clerk_user_id: str):
    """
    Build a self-contained review bundle for offline use.
    Returns due flashcards, full SM-2 state, and a highlight snapshot.
    JWT-protected via Kong; called directly by the frontend before going offline.
    """
    return await get_offline_package(clerk_user_id)


@app.post("/offline/{clerk_user_id}/sync")
async def offline_sync(clerk_user_id: str, body: SyncRequest):
    """
    Replay queued offline review ratings through the SM-2 update logic.
    Reviews are processed in reviewed_at order; already-processed review_ids
    are skipped (idempotent — safe to call multiple times with the same payload).
    """
    reviews = [r.model_dump() for r in body.reviews]
    return await apply_offline_sync(clerk_user_id, reviews)


@app.get("/internal/reminders/{clerk_user_id}/context")
async def reminder_context(
    clerk_user_id: str,
    x_internal_secret: str | None = Header(default=None, alias="x-internal-secret"),
):
    """
    Return reminder context for notification-service's daily-reminder and vocab-of-the-day jobs.
    Called by TS notification-service — verified with x-internal-secret header.
    Shape matches ReminderContextDto from packages/shared/src/dto/memory-progress.ts.
    """
    if x_internal_secret != settings.INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    due = await get_due_items(clerk_user_id)
    vocab_of_the_day = await pick_vocab_of_the_day(clerk_user_id)

    return {
        "userId": clerk_user_id,
        "dueReviewCount": len(due),
        "vocabOfTheDay": vocab_of_the_day,
    }

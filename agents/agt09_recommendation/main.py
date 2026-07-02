import asyncio
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from agents.shared.auth import require_matching_user
from agents.shared.db.redis_client import get_redis, close_redis
from agents.agt09_recommendation.service import get_recommendations, invalidate_cache
from agents.agt09_recommendation.consumers import start_consumers
from agents.agt09_recommendation.models import RecommendationItem


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_redis()
    tasks = await start_consumers()
    yield
    for t in tasks:
        t.cancel()
    await close_redis()


app = FastAPI(
    title="AGT-09: Recommendation Agent",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "AGT-09", "name": "Recommendation"}


@app.get("/recommendations/{clerk_user_id}", response_model=list[RecommendationItem])
async def recommendations(clerk_user_id: str, _: str = Depends(require_matching_user)):
    """
    Return cached recommendations for a user.
    Cold-start: popularity fallback when cold_start_flag=True.
    TODO Phase 8+: full composite multi-factor scoring formula.
    """
    return await get_recommendations(clerk_user_id)


@app.post("/recommendations/{clerk_user_id}/invalidate", status_code=204)
async def invalidate(clerk_user_id: str):
    """Invalidate recommendation cache. Called by AGT-02 on re-plan events."""
    await invalidate_cache(clerk_user_id)

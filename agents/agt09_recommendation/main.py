from contextlib import asynccontextmanager
from fastapi import FastAPI
from agents.shared.db.redis_client import get_redis, close_redis
from agents.agt09_recommendation.service import get_recommendations, invalidate_cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_redis()
    yield
    await close_redis()


app = FastAPI(
    title="AGT-09: Recommendation Agent",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "AGT-09", "name": "Recommendation"}


@app.get("/recommendations/{clerk_user_id}")
async def recommendations(clerk_user_id: str):
    """
    Return cached recommendations for a user.
    Cold-start: popularity fallback when cold_start_flag=True.
    TODO Phase 8+: composite multi-factor scoring with skill diversity enforcement.
    """
    return await get_recommendations(clerk_user_id)


@app.post("/recommendations/{clerk_user_id}/invalidate", status_code=204)
async def invalidate(clerk_user_id: str):
    """Invalidate recommendation cache. Called by AGT-02 on re-plan events."""
    await invalidate_cache(clerk_user_id)

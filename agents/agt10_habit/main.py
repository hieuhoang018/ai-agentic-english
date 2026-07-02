import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from agents.shared.db.redis_client import get_redis, close_redis
from agents.agt10_habit.exercise_library import get_exercise_library
from agents.agt10_habit.service import record_session_complete, get_streak
from agents.agt10_habit.models import RecordSessionRequest
from agents.agt10_habit.consumers import start_consumers


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_redis()
    tasks = await start_consumers()
    yield
    for t in tasks:
        t.cancel()
    await close_redis()


app = FastAPI(
    title="AGT-10: Habit Building Agent",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "AGT-10", "name": "Habit Building"}


@app.get("/library/{clerk_user_id}")
async def exercise_library(clerk_user_id: str):
    """
    Return the four-tab exercise library.
    Tabs: Today's Plan, Due for Review, Recommended, Browse.
    Each tab fetched in parallel — partial failures return empty tab.
    """
    return await get_exercise_library(clerk_user_id)


@app.post("/streak/{clerk_user_id}/record")
async def record_streak(clerk_user_id: str, body: RecordSessionRequest):
    """Record a completed qualifying session and update streak."""
    return await record_session_complete(
        clerk_user_id, body.current_streak, body.session_duration_minutes
    )


@app.get("/streak/{clerk_user_id}")
async def streak(clerk_user_id: str):
    """Return current streak from Redis."""
    current = await get_streak(clerk_user_id)
    return {"clerk_user_id": clerk_user_id, "streak": current}

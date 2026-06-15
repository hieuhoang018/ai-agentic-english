from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from agents.shared.db.postgres import get_pool, close_pool
from agents.shared.db.redis_client import get_redis, close_redis
from agents.agt01_profiling.service import get_profile, create_profile, update_profile
from agents.agt01_profiling.models import CreateProfileRequest, UpdateProfileRequest
from agents.agt01_profiling.consumers import start_consumers


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    await get_redis()
    consumer_tasks = await start_consumers()
    yield
    for task in consumer_tasks:
        task.cancel()
    await close_pool()
    await close_redis()


app = FastAPI(
    title="AGT-01: User Profiling Agent",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "AGT-01", "name": "User Profiling"}


@app.get("/profile/{clerk_user_id}")
async def get_learner_profile(clerk_user_id: str, session_id: str | None = None):
    """
    Retrieve learner profile.
    With ?session_id=: returns merged profile (base + in-session error deltas).
    Without ?session_id=: returns base LTM profile only.
    """
    return await get_profile(clerk_user_id, session_id)


@app.post("/profile/{clerk_user_id}", status_code=201)
async def create_learner_profile(clerk_user_id: str, body: CreateProfileRequest):
    """Create or re-initialise a learner profile. Idempotent."""
    profile = await create_profile(clerk_user_id)
    if body.goal_profile:
        profile = await update_profile(clerk_user_id, {"goal_profile": body.goal_profile})
    return profile


@app.patch("/profile/{clerk_user_id}")
async def patch_learner_profile(clerk_user_id: str, body: UpdateProfileRequest):
    """Partial update of profile fields. Only provided fields are changed."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    return await update_profile(clerk_user_id, updates)

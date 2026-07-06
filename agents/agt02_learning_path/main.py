import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException

from agents.shared.config import settings
from agents.shared.db.postgres import get_pool, close_pool
from agents.shared.db.redis_client import get_redis, close_redis
from agents.shared.events.producer import get_producer, close_producer
from agents.agt02_learning_path import service
from agents.agt02_learning_path.models import GeneratePlanRequest
from agents.agt02_learning_path.consumers import start_consumers


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    await get_redis()
    await get_producer()
    tasks = await start_consumers()
    yield
    for t in tasks:
        t.cancel()
    await close_pool()
    await close_redis()
    await close_producer()


app = FastAPI(title="AGT-02: Learning Path Agent", version="0.1.0", lifespan=lifespan)


def verify_internal_secret(
    x_internal_secret: str | None = Header(default=None, alias="x-internal-secret"),
) -> None:
    """
    All /plans/* routes are internal-only (called by the orchestrator, AGT-03,
    AGT-10 -- never directly by a browser/end user), so a single shared secret
    gates them, matching the x-internal-secret convention used elsewhere in
    the fleet (e.g. AGT-07's /internal/reminders endpoint).
    """
    if x_internal_secret != settings.INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "AGT-02", "name": "Learning Path"}


@app.post("/plans/{clerk_user_id}/generate", dependencies=[Depends(verify_internal_secret)])
async def generate_plan(clerk_user_id: str, body: GeneratePlanRequest):
    """Generate a new versioned learning plan, deactivating any prior active plan."""
    return await service.generate_plan(clerk_user_id, body.model_dump())


@app.get("/plans/{clerk_user_id}/active", dependencies=[Depends(verify_internal_secret)])
async def get_active_plan(clerk_user_id: str):
    plan = await service.get_active_plan(clerk_user_id)
    if not plan:
        raise HTTPException(404, "No active plan")
    return plan


@app.get("/plans/{clerk_user_id}/today", dependencies=[Depends(verify_internal_secret)])
async def get_today_plan(clerk_user_id: str):
    return await service.get_today_plan(clerk_user_id)


@app.post("/plans/{clerk_user_id}/replan", dependencies=[Depends(verify_internal_secret)])
async def replan(clerk_user_id: str, body: GeneratePlanRequest):
    """Force regeneration of the active plan (e.g. after profile drift)."""
    return await service.generate_plan(clerk_user_id, body.model_dump())

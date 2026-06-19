from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from agents.shared.db.postgres import get_pool, close_pool
from agents.shared.db.redis_client import get_redis, close_redis
from agents.shared.events.producer import get_producer, close_producer
from agents.agt03_tutor import service
from agents.agt03_tutor.models import (
    StartSessionRequest, StartSessionResponse,
    TurnRequest, TurnResponse,
    EndSessionRequest, EndSessionResponse,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    await get_redis()
    await get_producer()
    yield
    await close_pool()
    await close_redis()
    await close_producer()


app = FastAPI(title="AGT-03: AI Tutor / Conversation Agent", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "AGT-03", "name": "AI Tutor"}


@app.post("/sessions/start", response_model=StartSessionResponse)
async def start_session(body: StartSessionRequest):
    return await service.start_session(body.clerk_user_id, body.skill_focus, body.session_id)


@app.post("/sessions/turn", response_model=TurnResponse)
async def turn(body: TurnRequest):
    try:
        return await service.process_turn(body.session_id, body.user_message, body.audio_base64)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.post("/sessions/end", response_model=EndSessionResponse)
async def end_session(body: EndSessionRequest):
    return await service.end_session(body.session_id, body.clerk_user_id, body.skill_focus)


@app.get("/sessions/{session_id}/state")
async def session_state(session_id: str):
    return await service.get_session_state(session_id)

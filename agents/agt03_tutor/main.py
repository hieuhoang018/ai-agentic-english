import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, WebSocket

from agents.shared.auth import extract_user_id
from agents.shared.db.postgres import get_pool, close_pool
from agents.shared.db.redis_client import get_redis, close_redis
from agents.shared.events.producer import get_producer, close_producer
from agents.agt03_tutor import service
from agents.agt03_tutor import pipeline
from agents.agt03_tutor.models import (
    StartSessionRequest, StartSessionResponse,
    TurnRequest, TurnResponse,
    EndSessionRequest, EndSessionResponse,
)
from agents.agt03_tutor.tickets import SpeakingTicketRequest, SpeakingTicketResponse, issue_ticket
from agents.agt03_tutor.websocket_handler import handle_session

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    await get_redis()
    # Kafka being unreachable at boot must not take the whole agent down —
    # matches agents/agt_orchestrator/main.py's existing pattern. emit()
    # retries the producer lazily on the next call once Kafka is back.
    try:
        await get_producer()
    except Exception:
        logger.error("Kafka producer startup failed; continuing without it", exc_info=True)
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
        return await pipeline.run_turn_pipeline(body.session_id, body.user_message, body.audio_base64)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.post("/sessions/end", response_model=EndSessionResponse)
async def end_session(body: EndSessionRequest):
    try:
        return await service.end_session(body.session_id, body.clerk_user_id, body.skill_focus)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.get("/sessions/{session_id}/state")
async def session_state(session_id: str):
    return await service.get_session_state(session_id)


@app.post("/speaking/session-ticket", response_model=SpeakingTicketResponse)
async def speaking_session_ticket(
    body: SpeakingTicketRequest | None = None,
    authorization: str | None = Header(None),
):
    clerk_user_id = extract_user_id(authorization)
    skill_focus = body.skill_focus if body else "SPEAKING"
    return await issue_ticket(clerk_user_id, skill_focus)


@app.websocket("/ws/sessions/{session_id}")
async def websocket_session(websocket: WebSocket, session_id: str):
    await handle_session(websocket, session_id)

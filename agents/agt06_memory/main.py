from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from agents.shared.db.postgres import get_pool, close_pool
from agents.shared.db.redis_client import get_redis, close_redis
from agents.shared.events.producer import get_producer, close_producer
from agents.agt06_memory import stm, ltm, consolidation
from agents.agt06_memory.models import (
    AppendErrorRequest, SetStateRequest, AppendContextRequest,
    AppendVocabRequest, ConsolidateRequest, ReviewCenterQuery,
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


app = FastAPI(
    title="AGT-06: Memory & Knowledge Agent",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "AGT-06", "name": "Memory & Knowledge"}


# ── STM endpoints ─────────────────────────────────────────────────────────────

@app.post("/sessions/{session_id}/errors", status_code=204)
async def append_error(session_id: str, body: AppendErrorRequest):
    """Append an error event. Called by AGT-04 as part of dual-write."""
    error = body.model_dump()
    await stm.append_error(session_id, error)


@app.get("/sessions/{session_id}/errors")
async def get_errors(session_id: str):
    """Read the session error log. Used by AGT-01 for intra-session merge."""
    return await stm.get_errors(session_id)


@app.post("/sessions/{session_id}/state", status_code=204)
async def set_state(session_id: str, body: SetStateRequest):
    await stm.set_state(session_id, body.model_dump())


@app.get("/sessions/{session_id}/state")
async def get_state(session_id: str):
    state = await stm.get_state(session_id)
    if state is None:
        raise HTTPException(404, "Session state not found")
    return state


@app.post("/sessions/{session_id}/context", status_code=204)
async def append_context(session_id: str, body: AppendContextRequest):
    await stm.append_context_turn(session_id, body.model_dump())


@app.get("/sessions/{session_id}/context")
async def get_context(session_id: str):
    return await stm.get_context(session_id)


@app.post("/sessions/{session_id}/vocab", status_code=204)
async def append_vocab(session_id: str, body: AppendVocabRequest):
    await stm.append_vocab(session_id, body.model_dump())


# ── Consolidation ─────────────────────────────────────────────────────────────

@app.post("/sessions/{session_id}/consolidate")
async def consolidate(session_id: str, body: ConsolidateRequest):
    """
    Trigger idempotent STM→LTM consolidation.
    Returns {consolidated: true} if done now, {consolidated: false} if already done.
    """
    result = await consolidation.consolidate_session(
        session_id, body.clerk_user_id, body.skill_focus
    )
    return {"consolidated": result, "session_id": session_id}


# ── LTM read endpoints ────────────────────────────────────────────────────────

@app.get("/ltm/{clerk_user_id}/vocabulary")
async def get_vocabulary(clerk_user_id: str, limit: int = 200):
    return await ltm.get_vocabulary(clerk_user_id, limit)


@app.get("/ltm/{clerk_user_id}/errors")
async def get_ltm_errors(clerk_user_id: str, skill_domain: str | None = None, limit: int = 100):
    return await ltm.get_errors(clerk_user_id, skill_domain, limit)


@app.get("/ltm/{clerk_user_id}/sessions")
async def get_sessions(clerk_user_id: str, limit: int = 20):
    return await ltm.get_sessions(clerk_user_id, limit)


@app.get("/ltm/{clerk_user_id}/conversations")
async def get_conversations(clerk_user_id: str, limit: int = 20):
    return await ltm.get_conversations(clerk_user_id, limit)


# ── Review Center ─────────────────────────────────────────────────────────────

@app.get("/review-center/{clerk_user_id}")
async def review_center(clerk_user_id: str, query: str | None = None, limit: int = 20):
    """
    Returns structured LTM data for the Review Center.
    Semantic search over conversation_archive when query is provided.
    TODO Phase 8+: implement pgvector IVFFlat similarity search once index exists.
    """
    errors = await ltm.get_errors(clerk_user_id, limit=50)
    vocab = await ltm.get_vocabulary(clerk_user_id, limit=100)
    sessions = await ltm.get_sessions(clerk_user_id, limit=20)
    conversations = await ltm.get_conversations(clerk_user_id, limit=limit)
    return {
        "errors": errors,
        "vocabulary": vocab,
        "sessions": sessions,
        "conversations": conversations,
        "semantic_search_available": False,  # True once IVFFlat index exists
    }

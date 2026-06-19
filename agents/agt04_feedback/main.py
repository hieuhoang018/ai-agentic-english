from contextlib import asynccontextmanager
from fastapi import FastAPI
from agents.agt04_feedback.service import analyze_speaking_turn, analyze_writing
from agents.agt04_feedback.models import (
    SpeakingFeedbackRequest, WritingFeedbackRequest,
    ComprehensionFeedbackRequest, SessionEndRequest,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="AGT-04: Feedback Agent",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "AGT-04", "name": "Feedback"}


@app.post("/feedback/speaking")
async def speaking_feedback(body: SpeakingFeedbackRequest):
    """
    Analyze a single speaking turn.
    Dual-writes all error events to Redis STM + Kafka agent.errors.
    Returns immediate feedback for display to user.
    """
    return await analyze_speaking_turn(
        transcript=body.transcript,
        session_id=body.session_id,
        clerk_user_id=body.clerk_user_id,
        duration_seconds=body.duration_seconds,
        skill_domain=body.skill_domain,
    )


@app.post("/feedback/writing")
async def writing_feedback(body: WritingFeedbackRequest):
    """
    Analyze a writing submission. Post-submission — latency target <20s.
    Dual-writes grammar errors to Redis STM + Kafka.
    Returns quality scores and annotated grammar errors.
    """
    return await analyze_writing(
        draft=body.draft,
        prompt=body.prompt,
        session_id=body.session_id,
        clerk_user_id=body.clerk_user_id,
    )


@app.post("/feedback/comprehension")
async def comprehension_feedback(body: ComprehensionFeedbackRequest):
    """
    Score listening/reading comprehension responses.
    TODO Phase 4: implement full comprehension scoring with barrier-type detection.
    """
    # Stub: score all responses as correct for now
    score = 1.0
    return {
        "score": score,
        "skill_domain": body.skill_domain,
        "feedback": "[STUB] Comprehension feedback not yet implemented",
        "barrier_type": None,
    }


@app.post("/feedback/session-end")
async def session_end_feedback(body: SessionEndRequest):
    """
    Generate end-of-session feedback summary per skill.
    Reads full STM error log from AGT-06 and computes per-skill breakdown.
    TODO Phase 4: implement full session summary computation.
    """
    return {
        "session_id": body.session_id,
        "summary": "[STUB] Session summary not yet implemented",
        "errors_by_skill": {},
    }

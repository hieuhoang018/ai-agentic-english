from contextlib import asynccontextmanager
from fastapi import FastAPI
from agents.agt04_feedback.service import (
    analyze_speaking_turn, analyze_writing, summarize_session, score_comprehension,
)
from agents.agt04_feedback.models import (
    SpeakingFeedbackRequest, WritingFeedbackRequest,
    ComprehensionFeedbackRequest, SessionEndRequest,
)
from agents.shared.events.producer import close_producer
from agents.shared.http.client import get_http_client, close_http_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_http_client()
    yield
    await close_producer()
    await close_http_client()


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
    Score listening/reading comprehension responses against the exercise's
    LMS answer key. Correctness-only — does not implement barrier-type
    detection (see service.score_comprehension docstring for scope).
    """
    return await score_comprehension(
        responses=body.responses,
        exercise_id=body.exercise_id,
        session_id=body.session_id,
        clerk_user_id=body.clerk_user_id,
        skill_domain=body.skill_domain,
    )


@app.post("/feedback/session-end")
async def session_end_feedback(body: SessionEndRequest):
    """
    Generate end-of-session feedback summary per skill.
    Reads full STM error log from AGT-06 and computes per-skill breakdown.
    """
    return await summarize_session(body.session_id, body.clerk_user_id)

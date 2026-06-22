import logging
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from agents.shared.events.producer import close_producer, emit, emit_ts_event, get_producer

logger = logging.getLogger(__name__)

AGT01_BASE_URL = os.environ.get("AGT01_BASE_URL", "http://agt01-profiling:8101")
AGT02_BASE_URL = os.environ.get("AGT02_BASE_URL", "http://agt02-learning-path:8102")
LM_SERVICE_BASE_URL = os.environ.get("LM_SERVICE_BASE_URL", "http://learning-materials-service:4002")
INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "dev-internal-secret")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_producer()
    yield
    await close_producer()


app = FastAPI(title="AGT-Orchestrator", version="0.1.0", lifespan=lifespan)


class OnboardingRequest(BaseModel):
    userId: str
    currentLevel: str = "A1"
    dailyTimeBudgetMinutes: int = 15
    goals: list[str] = []


class GradingRequest(BaseModel):
    exerciseId: str
    attemptedAnswer: str
    userId: str


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "AGT-Orchestrator"}


@app.post("/orchestrate/onboarding", status_code=201)
async def orchestrate_onboarding(body: OnboardingRequest):
    async with httpx.AsyncClient(timeout=10.0) as client:
        r1 = await client.post(
            f"{AGT01_BASE_URL}/profile/{body.userId}",
            json={
                "clerk_user_id": body.userId,
                "goal_profile": {"currentLevel": body.currentLevel, "goals": body.goals},
            },
        )
        if r1.status_code >= 500:
            raise HTTPException(status_code=502, detail="AGT-01 profile creation failed")

        r2 = await client.post(
            f"{AGT02_BASE_URL}/plans/{body.userId}/generate",
            json={
                "skill_estimates": None,
                "daily_minutes": body.dailyTimeBudgetMinutes,
                "goals": body.goals,
            },
        )
        if r2.status_code >= 500:
            raise HTTPException(status_code=502, detail="AGT-02 plan generation failed")

    plan = r2.json()

    try:
        await emit_ts_event(
            "learning-path.ready",
            "learning-path.ready",
            {"userId": body.userId, "pathId": plan["plan_id"]},
            key=body.userId,
        )
    except Exception:
        logger.error("Failed to emit learning-path.ready for user=%s", body.userId, exc_info=True)

    return {
        "id": plan["plan_id"],
        "userId": body.userId,
        "pathDefinition": {"activities": plan.get("activities", [])},
        "createdAt": plan.get("created_at", ""),
    }


@app.post("/orchestrate/grading")
async def orchestrate_grading(body: GradingRequest):
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            f"{LM_SERVICE_BASE_URL}/internal/exercises/{body.exerciseId}",
            headers={"x-internal-secret": INTERNAL_SECRET},
        )

    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if r.status_code >= 500:
        raise HTTPException(status_code=502, detail="LMS exercise fetch failed")

    exercise = r.json()
    answer_key = exercise.get("answerKey") or {}
    correct_answer = answer_key.get("answer", "")

    correct = body.attemptedAnswer.strip().lower() == correct_answer.strip().lower()
    score = 1.0 if correct else 0.0
    feedback = "Correct!" if correct else f"Incorrect. The correct answer is: {correct_answer}"

    try:
        await emit(
            "attempt.recorded",
            {"exerciseId": body.exerciseId, "userId": body.userId, "correct": correct, "score": score},
            agent_id="ORCH",
            key=body.userId,
        )
    except Exception:
        logger.error("Failed to emit attempt.recorded for exercise=%s", body.exerciseId, exc_info=True)

    return {
        "exerciseId": body.exerciseId,
        "correct": correct,
        "score": score,
        "feedback": feedback,
    }

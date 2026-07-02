import logging
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from agents.shared.events.producer import close_producer, emit, emit_ts_event, get_producer
from agents.shared.security import assert_internal_secret_is_safe

logger = logging.getLogger(__name__)

AGT01_BASE_URL = os.environ.get("AGT01_BASE_URL", "http://agt01-profiling:8101")
AGT02_BASE_URL = os.environ.get("AGT02_BASE_URL", "http://agt02-learning-path:8102")
LM_SERVICE_BASE_URL = os.environ.get("LM_SERVICE_BASE_URL", "http://learning-materials-service:4002")
INFERENCE_MODE = os.environ.get("INFERENCE_MODE", "mock")
INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "dev-internal-secret")

assert_internal_secret_is_safe(INTERNAL_SECRET, INFERENCE_MODE)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await get_producer()
    except Exception:
        logger.error("Kafka producer startup failed; continuing without it", exc_info=True)
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


def _has_database_backed_modules(path_definition: dict | None) -> bool:
    if not isinstance(path_definition, dict):
        return False
    modules = path_definition.get("modules")
    return isinstance(modules, list) and len(modules) > 0


async def _fetch_learning_materials_path_definition(client: httpx.AsyncClient, lm_plan_id: str | None) -> dict | None:
    if not lm_plan_id:
        return None

    try:
        response = await client.get(
            f"{LM_SERVICE_BASE_URL}/internal/learning-paths/{lm_plan_id}",
            headers={"x-internal-secret": INTERNAL_SECRET},
        )
    except httpx.HTTPError as exc:
        logger.error("Learning Materials path lookup failed for path=%s: %s", lm_plan_id, exc)
        return None

    if not response.is_success:
        logger.error(
            "Learning Materials path lookup returned status %s for path=%s",
            response.status_code,
            lm_plan_id,
        )
        return None

    try:
        path = response.json()
    except ValueError:
        logger.error("Learning Materials path lookup returned invalid JSON for path=%s", lm_plan_id)
        return None

    path_definition = path.get("pathDefinition")
    return path_definition if isinstance(path_definition, dict) else None


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "AGT-Orchestrator"}


@app.post("/orchestrate/onboarding", status_code=201)
async def orchestrate_onboarding(body: OnboardingRequest):
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r1 = await client.post(
                f"{AGT01_BASE_URL}/profile/{body.userId}",
                json={
                    "clerk_user_id": body.userId,
                    "goal_profile": {"currentLevel": body.currentLevel, "goals": body.goals},
                },
            )
        except httpx.HTTPError as exc:
            logger.error("AGT-01 unreachable: %s", exc)
            raise HTTPException(status_code=502, detail="AGT-01 profile creation failed")
        if not r1.is_success:
            raise HTTPException(status_code=502, detail="AGT-01 profile creation failed")

        try:
            r2 = await client.post(
                f"{AGT02_BASE_URL}/plans/{body.userId}/generate",
                json={
                    "skill_estimates": None,
                    "daily_minutes": body.dailyTimeBudgetMinutes,
                    "goals": body.goals,
                },
            )
        except httpx.HTTPError as exc:
            logger.error("AGT-02 unreachable: %s", exc)
            raise HTTPException(status_code=502, detail="AGT-02 plan generation failed")
        if not r2.is_success:
            raise HTTPException(status_code=502, detail="AGT-02 plan generation failed")

        try:
            plan = r2.json()
        except ValueError:
            raise HTTPException(status_code=502, detail="AGT-02 plan generation failed")

        plan_id = plan.get("plan_id")
        if not isinstance(plan_id, str) or not plan_id:
            raise HTTPException(status_code=502, detail="AGT-02 plan generation response missing plan_id")

        path_definition = plan.get("path_definition")
        if not isinstance(path_definition, dict):
            path_definition = await _fetch_learning_materials_path_definition(client, plan.get("lm_plan_id"))

    if not _has_database_backed_modules(path_definition):
        raise HTTPException(status_code=502, detail="Generated path has no database-backed modules")

    try:
        await emit_ts_event(
            "learning-path.ready",
            "learning-path.ready",
            {"userId": body.userId, "pathId": plan_id},
            key=body.userId,
        )
    except Exception:
        logger.error("Failed to emit learning-path.ready for user=%s", body.userId, exc_info=True)

    return {
        "id": plan_id,
        "learningPathId": plan.get("lm_plan_id"),
        "userId": body.userId,
        "pathDefinition": path_definition,
        "createdAt": plan.get("created_at", ""),
    }


@app.post("/orchestrate/grading")
async def orchestrate_grading(body: GradingRequest):
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{LM_SERVICE_BASE_URL}/internal/exercises/{body.exerciseId}",
                headers={"x-internal-secret": INTERNAL_SECRET},
            )
    except httpx.HTTPError as exc:
        logger.error("LMS unreachable for exercise=%s: %s", body.exerciseId, exc)
        raise HTTPException(status_code=502, detail="LMS service unreachable")

    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if not r.is_success:
        raise HTTPException(status_code=502, detail="LMS exercise fetch failed")

    exercise = r.json()
    answer_key = exercise.get("answerKey") or {}
    correct_answer = answer_key.get("answer", "")

    correct = body.attemptedAnswer.strip().lower() == correct_answer.strip().lower()
    score = 1.0 if correct else 0.0
    feedback = "Correct!" if correct else f"Incorrect"

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

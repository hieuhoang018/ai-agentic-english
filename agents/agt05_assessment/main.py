from contextlib import asynccontextmanager
from fastapi import FastAPI
from agents.agt05_assessment.service import start_assessment, record_response
from agents.agt05_assessment.models import StartAssessmentRequest, RespondRequest
from agents.shared.db.postgres import get_pool, close_pool
from agents.shared.http.client import get_http_client, close_http_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()   # pre-warm connection pool so first request doesn't pay the cost
    await get_http_client()
    yield
    await close_pool()
    await close_http_client()


app = FastAPI(
    title="AGT-05: Assessment Agent",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "AGT-05", "name": "Assessment"}


@app.post("/assessments/start")
async def start(body: StartAssessmentRequest):
    """
    Start a CAT placement assessment for one skill domain.
    Returns first item at theta=0.0 (midpoint).
    Uses Fisher-information maximisation via select_next_item_eap.
    """
    return await start_assessment(body.clerk_user_id, body.skill_domain)


@app.post("/assessments/respond")
async def respond(body: RespondRequest):
    """
    Record a response and return the next item or termination result.
    Terminates on SE(theta) < 0.3 or item-bank exhaustion via should_terminate_eap.
    """
    return await record_response(
        body.assessment_id,
        body.item_id,
        body.correct,
        [r.model_dump() for r in body.prior_responses],
        body.skill_domain,
        body.clerk_user_id,
    )

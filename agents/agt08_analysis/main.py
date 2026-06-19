from contextlib import asynccontextmanager
from fastapi import FastAPI
from agents.agt08_analysis.service import run_analysis


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="AGT-08: Progress Analysis Agent",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "AGT-08", "name": "Progress Analysis"}


@app.post("/analysis/{clerk_user_id}/run")
async def run(clerk_user_id: str):
    """
    Run all analysis algorithms for a user.
    All algorithms are stubs at scaffold — returns empty pattern list.
    TODO Phase 8+: CUSUM, PELT changepoint, logistic regression risk model.
    """
    return await run_analysis(clerk_user_id)


@app.get("/analysis/{clerk_user_id}/latest")
async def latest(clerk_user_id: str):
    """
    Return the latest analysis results for a user.
    TODO Phase 8+: read from cached analysis results in LTM.
    """
    return {
        "clerk_user_id": clerk_user_id,
        "patterns": [],
        "velocity": {},
        "forecast": {},
        "insufficient_data": True,
        "stub": True,
    }

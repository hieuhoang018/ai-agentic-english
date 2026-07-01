import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from agents.agt08_analysis.service import run_analysis
from agents.agt08_analysis.consumers import start_consumers


@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = await start_consumers()
    yield
    for t in tasks:
        t.cancel()


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
    Run all analysis algorithms for a user and return the results.

    Runs a CUSUM control chart (cusum.py) for persistent error detection, a
    PELT changepoint algorithm (changepoint.py) per assessed skill domain for
    plateau detection, and a multi-signal weighted risk score (risk_model.py)
    for disengagement prediction. See those modules for implementation
    details. Detected patterns and high-risk scores are also emitted to Kafka.
    """
    return await run_analysis(clerk_user_id)


@app.get("/analysis/{clerk_user_id}/latest")
async def latest(clerk_user_id: str):
    """
    Return the latest analysis results for a user.

    Not yet implemented: there is no persistence layer for analysis results,
    so this always returns an empty placeholder rather than real data. Use
    POST /analysis/{clerk_user_id}/run to get a real, freshly computed
    result. TODO Phase 8+: read from cached analysis results in LTM.
    """
    return {
        "clerk_user_id": clerk_user_id,
        "patterns": [],
        "velocity": {},
        "forecast": {},
        "insufficient_data": True,
        "not_implemented": True,
    }

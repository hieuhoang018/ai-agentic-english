import asyncio
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from agents.agt08_analysis.service import run_analysis, get_latest_analysis
from agents.agt08_analysis.consumers import start_consumers
from agents.shared.auth import require_matching_user


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
async def latest(clerk_user_id: str, _: str = Depends(require_matching_user)):
    """
    Return the latest persisted analysis for a user, written by
    run_analysis() after every AGT-06 consolidation. A missing key means no
    analysis has run for this user yet -> insufficient_data: true, not an
    error. Use POST /analysis/{clerk_user_id}/run only for internal,
    Kafka-triggered recomputation — it is not Kong-routed.
    """
    return await get_latest_analysis(clerk_user_id)

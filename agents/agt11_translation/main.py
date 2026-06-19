from contextlib import asynccontextmanager
from fastapi import FastAPI
from agents.shared.db.redis_client import get_redis, close_redis
from agents.agt11_translation.service import translate_for_user, explain_error, get_zone_for_user
from agents.agt11_translation.models import TranslateRequest, ExplainRequest


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_redis()
    yield
    await close_redis()


app = FastAPI(
    title="AGT-11: Translation & Explanation Agent",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "AGT-11", "name": "Translation & Explanation"}


@app.post("/translate")
async def translate(body: TranslateRequest):
    """
    Translate content to Vietnamese using the learner's proficiency zone.
    Cache-first — >70% of requests served from Redis cache.
    """
    return await translate_for_user(body.content, body.clerk_user_id, body.session_type)


@app.post("/explain")
async def explain(body: ExplainRequest):
    """Generate a bilingual explanation for a grammar error."""
    return await explain_error(body.error_type, body.example, body.clerk_user_id, body.session_type)


@app.get("/zone/{clerk_user_id}")
async def get_zone(clerk_user_id: str, session_type: str = "exercise"):
    """Return the current language zone for a user (reads theta-R from AGT-01)."""
    zone, theta_r = await get_zone_for_user(clerk_user_id, session_type)
    return {"zone": zone, "theta_r": theta_r}

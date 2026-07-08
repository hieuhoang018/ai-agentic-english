from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from agents.shared.auth import require_matching_user
from agents.shared.db.redis_client import get_redis, close_redis
from agents.agt11_translation.service import translate_for_user, explain_error, get_zone_for_user
from agents.agt11_translation.models import TranslateRequest, ExplainRequest, TranslateContentRequest


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


@app.post("/translate/{clerk_user_id}")
async def translate_for_frontend(
    clerk_user_id: str,
    body: TranslateContentRequest,
    _: str = Depends(require_matching_user),
):
    """
    User-facing translate call (e.g. Practice Center's "Xem bản dịch" toggle),
    JWT-scoped via Kong. Leaves the body-based POST /translate above
    untouched — that one is AGT-03's internal, unauthenticated caller.
    """
    return await translate_for_user(body.content, clerk_user_id, body.session_type)


@app.get("/zone/{clerk_user_id}")
async def get_zone(
    clerk_user_id: str,
    session_type: str = "exercise",
    _: str = Depends(require_matching_user),
):
    """Return the current language zone for a user (reads theta-R from AGT-01)."""
    zone, theta_r = await get_zone_for_user(clerk_user_id, session_type)
    return {"zone": zone, "theta_r": theta_r}

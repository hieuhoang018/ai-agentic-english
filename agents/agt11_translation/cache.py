"""
Cache-first EN↔VI translation pipeline.

Priority: Redis cache → OpenRouter Qwen3-235B → Ollama Qwen2.5:7b

Cache key: trans:{sha256(content+zone)[:16]}
TTL: 24 hours
Target hit rate: >70% (grammar rules and vocabulary definitions repeat across users)

In mock mode: returns a prefixed stub without any API call.
"""

import hashlib
import logging
from agents.shared.db.redis_client import get_redis
from agents.shared.llm.router import call_llm, AgentID
from agents.shared.config import settings

logger = logging.getLogger(__name__)

CACHE_TTL = 86400  # 24 hours

TRANSLATION_SYSTEM_PROMPT = (
    "You are a Vietnamese English teacher. "
    "Translate the following English grammar explanation or vocabulary definition to Vietnamese. "
    "Use a patient, clear teaching tone suitable for adult learners. "
    "Preserve all English example sentences exactly as written in the original. "
    "Return only the Vietnamese translation — no preamble, no explanation of your process."
)


def _cache_key(content: str, zone: str) -> str:
    h = hashlib.sha256(f"{content}:{zone}".encode("utf-8")).hexdigest()[:16]
    return f"trans:{h}"


async def translate(content: str, zone: str) -> tuple[str, bool]:
    """
    Translate content to Vietnamese, cache-first.
    Returns (translated_text, was_cache_hit).
    In mock mode returns a deterministic stub.
    """
    if settings.INFERENCE_MODE == "mock":
        return f"[MOCK VI] {content[:80]}", False

    r = await get_redis()
    key = _cache_key(content, zone)

    cached = await r.get(key)
    if cached:
        return cached.decode("utf-8"), True

    # Cache miss: call LLM (AGT-11 uses OpenRouter→Ollama, never Groq)
    messages = [
        {"role": "system", "content": TRANSLATION_SYSTEM_PROMPT},
        {"role": "user", "content": content},
    ]
    translated = await call_llm(messages, AgentID.AGT11)

    await r.setex(key, CACHE_TTL, translated.encode("utf-8"))
    logger.debug("Translation cached key=%s", key)
    return translated, False

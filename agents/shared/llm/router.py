"""
Three-tier LLM routing for the AI agent layer.

Tier 1 — Groq (primary, speed-critical real-time paths):
  Real-time agents: AGT-03, AGT-04, AGT-05
  Free quota: 1,000 RPD org-level — preserved exclusively for real-time agents.

Tier 2 — OpenRouter (fallback, async agents + Groq overflow):
  Free quota: 50 RPD at $0 balance.
  Async agents skip Groq entirely and start here.

Tier 3 — Ollama (backstop, always available):
  No rate limit. CPU-only, 8-15 tok/s.
  Used when both Groq and OpenRouter are exhausted or unavailable.

INFERENCE_MODE=mock: all calls return a mock response instantly.
  No API keys required. Default for development.
"""

import logging
from enum import Enum
from openai import AsyncOpenAI
from agents.shared.config import settings

logger = logging.getLogger(__name__)


class AgentID(str, Enum):
    AGT01 = "AGT01"
    AGT02 = "AGT02"
    AGT03 = "AGT03"
    AGT04 = "AGT04"
    AGT05 = "AGT05"
    AGT06 = "AGT06"
    AGT07 = "AGT07"
    AGT08 = "AGT08"
    AGT09 = "AGT09"
    AGT10 = "AGT10"
    AGT11 = "AGT11"
    # Not a numbered agent in the 11-agent architecture — a dispatch key for the
    # one-off/on-demand Phase C content-generation batch script
    # (agents/tools/content_gen_etl.py), same non-service status as AGT-03's
    # tooling-only sibling (agents/tools/voa_passages_etl.py, which has no
    # AgentID at all since it makes no LLM calls).
    CONTENT_GEN = "CONTENT_GEN"


# Real-time agents — Groq Tier 1 first (preserve 1,000 RPD budget for these only)
REALTIME_AGENTS = {AgentID.AGT03, AgentID.AGT04, AgentID.AGT05}

# Async agents — skip Groq entirely, OpenRouter -> Ollama
ASYNC_AGENTS = {
    AgentID.AGT02,
    AgentID.AGT07,
    AgentID.AGT08,
    AgentID.AGT09,
    AgentID.AGT11,
    AgentID.CONTENT_GEN,
}

GROQ_MODELS: dict[AgentID, str] = {
    AgentID.AGT03: "llama-3.3-70b-versatile",  # conversation — best quality on Groq
    AgentID.AGT04: "llama-3.1-8b-instant",     # grammar feedback — 800+ TPS, <500ms
    AgentID.AGT05: "llama-3.3-70b-versatile",  # CEFR band classification
}

OPENROUTER_MODELS: dict[AgentID, str] = {
    AgentID.AGT03: "google/gemini-2.0-flash-exp:free",  # conversation fallback
    AgentID.AGT02: "deepseek/deepseek-chat-v3.1:free",  # plan generation
    AgentID.AGT07: "deepseek/deepseek-chat-v3.1:free",  # review generation
    AgentID.AGT08: "deepseek/deepseek-r1:free",         # analysis (chain-of-thought)
    AgentID.AGT09: "deepseek/deepseek-chat-v3.1:free",  # recommendation rationale
    AgentID.AGT11: "qwen/qwen3-235b-a22b:free",         # EN-VI translation (best Vietnamese)
    # deepseek/deepseek-chat-v3.1:free (originally chosen to match AGT02/07/09) was
    # retired by OpenRouter (404, paid-only now) as of this writing — openai/gpt-oss-20b:free
    # is free, not upstream-rate-limited, and confirmed to follow strict-JSON instructions.
    AgentID.CONTENT_GEN: "openai/gpt-oss-20b:free",
}

OLLAMA_MODELS: dict[AgentID, str] = {
    AgentID.AGT03: "llama3.1:8b",   # conversation backstop
    AgentID.AGT04: "llama3.1:8b",   # grammar analysis backstop
    AgentID.AGT02: "gemma3:4b",     # planning backstop
    AgentID.AGT07: "gemma3:4b",     # review backstop
    AgentID.AGT08: "llama3.1:8b",   # analysis backstop
    AgentID.AGT09: "gemma3:4b",     # recommendation backstop
    AgentID.AGT11: "qwen2.5:7b",    # translation backstop (multilingual)
    AgentID.CONTENT_GEN: "gemma3:4b",  # content-gen backstop, same as AGT02/07/09's gemma3:4b
}


def _groq_client() -> AsyncOpenAI:
    return AsyncOpenAI(base_url=settings.GROQ_BASE_URL, api_key=settings.GROQ_API_KEY)


def _openrouter_client() -> AsyncOpenAI:
    return AsyncOpenAI(base_url=settings.OPENROUTER_BASE_URL, api_key=settings.OPENROUTER_API_KEY)


def _ollama_client() -> AsyncOpenAI:
    import httpx
    # Short connect timeout so a missing Ollama container fails fast (< 5 s)
    # rather than blocking each call for the full 60 s openai-client default.
    return AsyncOpenAI(
        base_url=settings.OLLAMA_BASE_URL + "/v1",
        api_key="ollama",
        http_client=httpx.AsyncClient(timeout=httpx.Timeout(connect=4.0, read=300.0, write=30.0, pool=4.0)),
    )


async def call_llm(
    messages: list[dict],
    agent_id: AgentID,
    **kwargs,
) -> str:
    """
    Route an LLM call through three tiers.

    In mock mode: returns a deterministic stub response immediately.
    In live mode: Groq -> OpenRouter -> Ollama with 429-based fallthrough.

    kwargs are passed through to the completion API (e.g. temperature, max_tokens).
    """
    if settings.INFERENCE_MODE == "mock":
        preview = str(messages[-1].get("content", ""))[:60] if messages else ""
        return f"[MOCK LLM {agent_id.value}] {preview}"

    # Real-time agents: start at Groq
    if agent_id in REALTIME_AGENTS and agent_id in GROQ_MODELS:
        try:
            client = _groq_client()
            resp = await client.chat.completions.create(
                model=GROQ_MODELS[agent_id],
                messages=messages,
                **kwargs,
            )
            return resp.choices[0].message.content or ""
        except Exception as exc:
            if "429" not in str(exc):
                raise
            logger.warning("Groq rate-limited for %s, falling to OpenRouter", agent_id)

    # OpenRouter tier (async agents start here; real-time agents fall here on 429)
    if agent_id in OPENROUTER_MODELS:
        try:
            client = _openrouter_client()
            resp = await client.chat.completions.create(
                model=OPENROUTER_MODELS[agent_id],
                messages=messages,
                **kwargs,
            )
            return resp.choices[0].message.content or ""
        except Exception as exc:
            if "429" not in str(exc):
                raise
            logger.warning("OpenRouter rate-limited for %s, falling to Ollama", agent_id)

    # Tier 3: Ollama — always available, unlimited, CPU-only
    model = OLLAMA_MODELS.get(agent_id, "llama3.1:8b")
    client = _ollama_client()
    resp = await client.chat.completions.create(
        model=model,
        messages=messages,
        **kwargs,
    )
    return resp.choices[0].message.content or ""

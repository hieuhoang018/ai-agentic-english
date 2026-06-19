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


# Real-time agents — Groq Tier 1 first (preserve 1,000 RPD budget for these only)
REALTIME_AGENTS = {AgentID.AGT03, AgentID.AGT04, AgentID.AGT05}

# Async agents — skip Groq entirely, OpenRouter -> Ollama
ASYNC_AGENTS = {AgentID.AGT02, AgentID.AGT07, AgentID.AGT08, AgentID.AGT09, AgentID.AGT11}

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
}

OLLAMA_MODELS: dict[AgentID, str] = {
    AgentID.AGT03: "llama3.1:8b",   # conversation backstop
    AgentID.AGT04: "llama3.1:8b",   # grammar analysis backstop
    AgentID.AGT02: "gemma3:4b",     # planning backstop
    AgentID.AGT07: "gemma3:4b",     # review backstop
    AgentID.AGT08: "llama3.1:8b",   # analysis backstop
    AgentID.AGT09: "gemma3:4b",     # recommendation backstop
    AgentID.AGT11: "qwen2.5:7b",    # translation backstop (multilingual)
}


def _groq_client() -> AsyncOpenAI:
    return AsyncOpenAI(base_url=settings.GROQ_BASE_URL, api_key=settings.GROQ_API_KEY)


def _openrouter_client() -> AsyncOpenAI:
    return AsyncOpenAI(base_url=settings.OPENROUTER_BASE_URL, api_key=settings.OPENROUTER_API_KEY)


def _ollama_client() -> AsyncOpenAI:
    return AsyncOpenAI(base_url=settings.OLLAMA_BASE_URL + "/v1", api_key="ollama")


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

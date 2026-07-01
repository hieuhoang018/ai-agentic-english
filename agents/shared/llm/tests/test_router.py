"""Tests for the three-tier LLM router: mock mode and live-mode tier fallthrough."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agents.shared.config import settings
from agents.shared.llm.router import AgentID, OPENROUTER_MODELS, call_llm


def _fake_client(content: str | None = None, error: Exception | None = None) -> MagicMock:
    client = MagicMock()
    if error is not None:
        client.chat.completions.create = AsyncMock(side_effect=error)
    else:
        response = MagicMock()
        response.choices = [MagicMock(message=MagicMock(content=content))]
        client.chat.completions.create = AsyncMock(return_value=response)
    return client


@pytest.fixture(autouse=True)
def _restore_inference_mode():
    original = settings.INFERENCE_MODE
    yield
    settings.INFERENCE_MODE = original


async def test_mock_mode_returns_canned_response():
    settings.INFERENCE_MODE = "mock"
    result = await call_llm([{"role": "user", "content": "hello"}], AgentID.AGT03)
    assert result.startswith("[MOCK LLM AGT03]")


async def test_realtime_agent_uses_groq_on_success():
    settings.INFERENCE_MODE = "live"
    with patch("agents.shared.llm.router._groq_client", return_value=_fake_client("groq reply")):
        result = await call_llm([{"role": "user", "content": "hi"}], AgentID.AGT03)
    assert result == "groq reply"


async def test_realtime_agent_falls_back_to_openrouter_on_groq_429():
    settings.INFERENCE_MODE = "live"
    with patch("agents.shared.llm.router._groq_client",
               return_value=_fake_client(error=Exception("429 rate limited"))), \
         patch("agents.shared.llm.router._openrouter_client",
               return_value=_fake_client("openrouter reply")):
        result = await call_llm([{"role": "user", "content": "hi"}], AgentID.AGT03)
    assert result == "openrouter reply"


async def test_realtime_agent_falls_back_to_openrouter_on_groq_non_429_error():
    """Regression: a non-429 Groq failure (500, timeout, etc.) must still fall
    through to OpenRouter instead of propagating — this was the bug."""
    settings.INFERENCE_MODE = "live"
    with patch("agents.shared.llm.router._groq_client",
               return_value=_fake_client(error=Exception("500 internal server error"))), \
         patch("agents.shared.llm.router._openrouter_client",
               return_value=_fake_client("openrouter reply")):
        result = await call_llm([{"role": "user", "content": "hi"}], AgentID.AGT03)
    assert result == "openrouter reply"


async def test_async_agent_skips_groq_and_calls_openrouter_directly():
    settings.INFERENCE_MODE = "live"
    with patch("agents.shared.llm.router._openrouter_client",
               return_value=_fake_client("openrouter reply")) as mock_or:
        result = await call_llm([{"role": "user", "content": "hi"}], AgentID.AGT02)
    assert result == "openrouter reply"
    mock_or.assert_called_once()


async def test_async_agent_falls_back_to_ollama_on_openrouter_404():
    """Regression: this is exactly the retired-model failure mode — a non-429
    OpenRouter error (404 model not found) must still fall through to Ollama."""
    settings.INFERENCE_MODE = "live"
    with patch("agents.shared.llm.router._openrouter_client",
               return_value=_fake_client(error=Exception("404 model not found"))), \
         patch("agents.shared.llm.router._ollama_client",
               return_value=_fake_client("ollama reply")):
        result = await call_llm([{"role": "user", "content": "hi"}], AgentID.AGT02)
    assert result == "ollama reply"


async def test_agt02_agt07_agt09_no_longer_reference_retired_model():
    for agent in (AgentID.AGT02, AgentID.AGT07, AgentID.AGT09):
        assert OPENROUTER_MODELS[agent] != "deepseek/deepseek-chat-v3.1:free"

import json
import pytest
from unittest.mock import AsyncMock, patch
from agents.agt04_feedback.writing_quality import score_writing


async def test_score_writing_mock_mode_returns_all_rubric_keys():
    result = await score_writing("Hello, I am writing an email.", context="professional email")
    for key in ("grammar", "coherence", "cohesion", "register", "structure"):
        assert key in result, f"Missing key: {key}"


async def test_score_writing_mock_mode_returns_expected_scores():
    result = await score_writing("test text")
    assert result["grammar"] == 0.7
    assert result["coherence"] == 0.65
    assert result["cohesion"] == 0.6
    assert result["register"] == 0.75
    assert result["structure"] == 0.8


async def test_score_writing_mock_mode_has_mock_flag():
    result = await score_writing("test text")
    assert result["mock"] is True


async def test_score_writing_mock_mode_vietnamese_indirectness_is_false():
    result = await score_writing("test text")
    assert result["vietnamese_indirectness"] is False


async def test_score_writing_mock_mode_has_top_issues():
    result = await score_writing("test text")
    assert "top_issues" in result
    assert isinstance(result["top_issues"], list)


async def test_score_writing_scores_in_valid_range():
    result = await score_writing("test text")
    for key in ("grammar", "coherence", "cohesion", "register", "structure"):
        assert 0.0 <= result[key] <= 1.0, f"{key} out of range: {result[key]}"


# ── live mode: routes through call_llm ───────────────────────────────────────

async def test_score_writing_live_mode_uses_call_llm(monkeypatch):
    """In live mode, score_writing must route through call_llm, not a direct AsyncOpenAI call."""
    mock_scores = {
        "grammar": 0.8, "coherence": 0.75, "cohesion": 0.7,
        "register": 0.9, "structure": 0.85,
        "vietnamese_indirectness": False, "top_issues": [],
    }
    import agents.agt04_feedback.writing_quality as wq
    monkeypatch.setattr(wq.settings, "INFERENCE_MODE", "live")

    with patch("agents.agt04_feedback.writing_quality.call_llm",
               new=AsyncMock(return_value=json.dumps(mock_scores))) as mock_call:
        result = await wq.score_writing("Dear sir, I am writing.", "professional email")

    assert mock_call.call_count == 1
    assert result["grammar"] == 0.8
    assert "error" not in result


async def test_score_writing_live_mode_malformed_json_returns_fallback(monkeypatch):
    """If LLM returns invalid JSON, score_writing returns fallback 0.5 scores without raising."""
    import agents.agt04_feedback.writing_quality as wq
    monkeypatch.setattr(wq.settings, "INFERENCE_MODE", "live")

    with patch("agents.agt04_feedback.writing_quality.call_llm",
               new=AsyncMock(return_value="not json at all")):
        result = await wq.score_writing("test", "email")

    assert result["grammar"] == 0.5
    assert result["coherence"] == 0.5
    assert "error" in result


async def test_score_writing_live_mode_missing_keys_get_defaults(monkeypatch):
    """If LLM response omits some rubric keys, they default to 0.5."""
    import agents.agt04_feedback.writing_quality as wq
    monkeypatch.setattr(wq.settings, "INFERENCE_MODE", "live")
    partial = {"grammar": 0.9}  # missing coherence, cohesion, register, structure

    with patch("agents.agt04_feedback.writing_quality.call_llm",
               new=AsyncMock(return_value=json.dumps(partial))):
        result = await wq.score_writing("test", "email")

    assert result["grammar"] == 0.9
    assert result["coherence"] == 0.5
    assert result["cohesion"] == 0.5

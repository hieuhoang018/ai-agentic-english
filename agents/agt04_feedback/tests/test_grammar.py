import pytest
from unittest.mock import AsyncMock, patch
from agents.agt04_feedback.grammar import analyze_grammar


def _lt_err(error_type, offset, length):
    return {"errorType": error_type, "offset": offset, "length": length,
            "source": "languagetool", "severity": 1, "message": "lt"}


def _llm_err(error_type, offset=-1, length=0):
    return {"errorType": error_type, "offset": offset, "length": length,
            "source": "llm", "severity": 1, "message": "llm"}


# ── mock mode ────────────────────────────────────────────────────────────────

async def test_analyze_grammar_mock_mode_returns_one_error():
    result = await analyze_grammar("hello world")
    assert len(result) == 1
    assert result[0]["errorType"] == "mock_grammar"


# ── dedup: positional errors ─────────────────────────────────────────────────

async def test_dedup_same_position_prefers_lt_over_llm():
    lt_errors = [_lt_err("grammar", 5, 3)]
    llm_errors = [_llm_err("grammar", offset=5, length=3)]
    with patch("agents.agt04_feedback.grammar._languagetool_check", new=AsyncMock(return_value=lt_errors)):
        with patch("agents.agt04_feedback.grammar._llm_contextual_check", new=AsyncMock(return_value=llm_errors)):
            result = await analyze_grammar("hello world test")
    assert len(result) == 1
    assert result[0]["source"] == "languagetool"


async def test_dedup_non_overlapping_positions_both_kept():
    lt_errors = [_lt_err("grammar", 0, 5)]
    llm_errors = [_llm_err("register", offset=10, length=3)]
    with patch("agents.agt04_feedback.grammar._languagetool_check", new=AsyncMock(return_value=lt_errors)):
        with patch("agents.agt04_feedback.grammar._llm_contextual_check", new=AsyncMock(return_value=llm_errors)):
            result = await analyze_grammar("hello world again")
    assert len(result) == 2


# ── dedup: doc-level errors (offset < 0) ─────────────────────────────────────

async def test_two_distinct_llm_doc_level_errors_both_kept():
    """Before fix: both share key (-1,0) — second was silently dropped."""
    lt_errors = []
    llm_errors = [
        _llm_err("register"),
        _llm_err("coherence"),
    ]
    with patch("agents.agt04_feedback.grammar._languagetool_check", new=AsyncMock(return_value=lt_errors)):
        with patch("agents.agt04_feedback.grammar._llm_contextual_check", new=AsyncMock(return_value=llm_errors)):
            result = await analyze_grammar("Hello. This is fine.")
    assert len(result) == 2
    error_types = {r["errorType"] for r in result}
    assert error_types == {"register", "coherence"}


async def test_lt_at_offset_minus_one_does_not_suppress_llm_doc_level():
    """An LT error at offset=-1 must NOT block LLM doc-level errors."""
    lt_errors = [{"errorType": "typo", "offset": -1, "length": 0,
                  "source": "languagetool", "severity": 2, "message": "lt"}]
    llm_errors = [_llm_err("register")]
    with patch("agents.agt04_feedback.grammar._languagetool_check", new=AsyncMock(return_value=lt_errors)):
        with patch("agents.agt04_feedback.grammar._llm_contextual_check", new=AsyncMock(return_value=llm_errors)):
            result = await analyze_grammar("Hello world.")
    assert len(result) == 2


async def test_lt_positional_error_does_not_suppress_llm_doc_level():
    """An LT positional error (offset>=0) must not affect LLM doc-level errors."""
    lt_errors = [_lt_err("grammar", 0, 5)]
    llm_errors = [_llm_err("register")]  # offset=-1
    with patch("agents.agt04_feedback.grammar._languagetool_check", new=AsyncMock(return_value=lt_errors)):
        with patch("agents.agt04_feedback.grammar._llm_contextual_check", new=AsyncMock(return_value=llm_errors)):
            result = await analyze_grammar("Hello world.")
    assert len(result) == 2


# ── empty cases ───────────────────────────────────────────────────────────────

async def test_empty_lt_and_llm_returns_empty():
    with patch("agents.agt04_feedback.grammar._languagetool_check", new=AsyncMock(return_value=[])):
        with patch("agents.agt04_feedback.grammar._llm_contextual_check", new=AsyncMock(return_value=[])):
            result = await analyze_grammar("hello")
    assert result == []


async def test_lt_only_returns_lt_errors():
    lt_errors = [_lt_err("grammar", 0, 5)]
    with patch("agents.agt04_feedback.grammar._languagetool_check", new=AsyncMock(return_value=lt_errors)):
        with patch("agents.agt04_feedback.grammar._llm_contextual_check", new=AsyncMock(return_value=[])):
            result = await analyze_grammar("hello world")
    assert len(result) == 1
    assert result[0]["source"] == "languagetool"

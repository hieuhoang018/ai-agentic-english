import pytest
from unittest.mock import AsyncMock, patch


# ── analyze_speaking_turn ────────────────────────────────────────────────────

@pytest.fixture
def mock_grammar_one_error(monkeypatch):
    monkeypatch.setattr(
        "agents.agt04_feedback.service.grammar.analyze_grammar",
        AsyncMock(return_value=[{"errorType": "grammar", "severity": 1}]),
    )


@pytest.fixture
def mock_grammar_four_errors(monkeypatch):
    monkeypatch.setattr(
        "agents.agt04_feedback.service.grammar.analyze_grammar",
        AsyncMock(return_value=[
            {"errorType": "grammar", "severity": 1},
            {"errorType": "vocabulary", "severity": 1},
            {"errorType": "fluency", "severity": 1},
            {"errorType": "register", "severity": 1},
        ]),
    )


@pytest.fixture
def mock_record_error(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr("agents.agt04_feedback.service.record_error", mock)
    return mock


async def test_speaking_turn_calls_record_error_once_for_single_error(
    mock_grammar_one_error, mock_record_error
):
    from agents.agt04_feedback.service import analyze_speaking_turn
    await analyze_speaking_turn("Hello world", "sess-1", "user-1", 5.0, "SPEAKING")
    assert mock_record_error.call_count == 1


async def test_speaking_turn_calls_record_error_for_all_errors(
    mock_grammar_four_errors, mock_record_error
):
    from agents.agt04_feedback.service import analyze_speaking_turn
    await analyze_speaking_turn("Um like hello world", "sess-1", "user-1", 5.0, "SPEAKING")
    assert mock_record_error.call_count == 4


async def test_speaking_turn_throttles_when_more_than_three_error_types(
    mock_grammar_four_errors, mock_record_error
):
    from agents.agt04_feedback.service import analyze_speaking_turn
    result = await analyze_speaking_turn("test", "sess-1", "user-1", 5.0)
    assert result["throttled"] is True
    assert result["total_errors_detected"] == 4
    assert result["surfaced_error_count"] == 1


async def test_speaking_turn_no_throttle_when_three_or_fewer_error_types(
    mock_grammar_one_error, mock_record_error
):
    from agents.agt04_feedback.service import analyze_speaking_turn
    result = await analyze_speaking_turn("test", "sess-1", "user-1", 5.0)
    assert result["throttled"] is False
    assert result["surfaced_error_count"] == 1


async def test_speaking_turn_stm_failure_raises(monkeypatch, mock_grammar_one_error):
    monkeypatch.setattr(
        "agents.agt04_feedback.service.record_error",
        AsyncMock(side_effect=Exception("AGT-06 unreachable")),
    )
    from agents.agt04_feedback.service import analyze_speaking_turn
    with pytest.raises(Exception, match="AGT-06 unreachable"):
        await analyze_speaking_turn("Hello", "sess-1", "user-1", 5.0)


async def test_speaking_turn_returns_fluency_metrics(mock_grammar_one_error, mock_record_error):
    from agents.agt04_feedback.service import analyze_speaking_turn
    result = await analyze_speaking_turn("Hello world", "sess-1", "user-1", duration_seconds=10.0)
    assert "fluency" in result
    assert "words_per_minute" in result["fluency"]


async def test_speaking_turn_no_errors_does_not_call_record_error(monkeypatch):
    monkeypatch.setattr(
        "agents.agt04_feedback.service.grammar.analyze_grammar",
        AsyncMock(return_value=[]),
    )
    mock_rec = AsyncMock()
    monkeypatch.setattr("agents.agt04_feedback.service.record_error", mock_rec)
    from agents.agt04_feedback.service import analyze_speaking_turn
    await analyze_speaking_turn("fine", "sess-1", "user-1", 5.0)
    assert mock_rec.call_count == 0


# ── analyze_writing ──────────────────────────────────────────────────────────

@pytest.fixture
def mock_writing_deps(monkeypatch):
    monkeypatch.setattr(
        "agents.agt04_feedback.service.grammar.analyze_grammar",
        AsyncMock(return_value=[{"errorType": "grammar", "severity": 1}]),
    )
    monkeypatch.setattr(
        "agents.agt04_feedback.service.writing_quality.score_writing",
        AsyncMock(return_value={"grammar": 0.7, "coherence": 0.65, "cohesion": 0.6,
                                "register": 0.75, "structure": 0.8, "mock": True}),
    )


@pytest.fixture
def mock_record_error_w(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr("agents.agt04_feedback.service.record_error", mock)
    return mock


async def test_writing_returns_quality_scores(mock_writing_deps, mock_record_error_w):
    from agents.agt04_feedback.service import analyze_writing
    result = await analyze_writing("Dear sir", "Write an email", "sess-1", "user-1")
    assert "quality_scores" in result
    assert result["quality_scores"]["grammar"] == 0.7


async def test_writing_returns_grammar_errors(mock_writing_deps, mock_record_error_w):
    from agents.agt04_feedback.service import analyze_writing
    result = await analyze_writing("Dear sir", "Write an email", "sess-1", "user-1")
    assert result["total_errors"] == 1


async def test_writing_has_no_throttled_key(mock_writing_deps, mock_record_error_w):
    """Writing feedback surfaces all errors — throttled key must not appear in response."""
    from agents.agt04_feedback.service import analyze_writing
    result = await analyze_writing("Dear sir", "Write an email", "sess-1", "user-1")
    assert "throttled" not in result


# ── dual-write record_error ───────────────────────────────────────────────────

async def test_record_error_raises_on_stm_failure(monkeypatch):
    monkeypatch.setattr(
        "agents.agt04_feedback.service._stm_append_error",
        AsyncMock(side_effect=Exception("STM down")),
    )
    monkeypatch.setattr(
        "agents.agt04_feedback.service._kafka_emit_error",
        AsyncMock(),
    )
    from agents.agt04_feedback.service import record_error
    with pytest.raises(Exception, match="STM down"):
        await record_error("sess-1", "user-1", {"error_type": "grammar"})


async def test_record_error_does_not_raise_on_kafka_failure(monkeypatch):
    monkeypatch.setattr(
        "agents.agt04_feedback.service._stm_append_error",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "agents.agt04_feedback.service._kafka_emit_error",
        AsyncMock(side_effect=Exception("Kafka down")),
    )
    from agents.agt04_feedback.service import record_error
    # Must NOT raise — Kafka is best-effort
    await record_error("sess-1", "user-1", {"error_type": "grammar"})


# ── AGT-11 bilingual explanation ─────────────────────────────────────────────

async def test_speaking_turn_populates_explanation_field(monkeypatch):
    """
    grammar_errors must contain an 'explanation' key after analyze_speaking_turn.
    When AGT-11 returns a Vietnamese string, it must be non-ASCII (Sprint A Check 5).
    """
    monkeypatch.setattr(
        "agents.agt04_feedback.service.grammar.analyze_grammar",
        AsyncMock(return_value=[{"errorType": "grammar", "severity": 1}]),
    )
    monkeypatch.setattr("agents.agt04_feedback.service.record_error", AsyncMock())
    monkeypatch.setattr(
        "agents.agt04_feedback.service._get_bilingual_explanation",
        AsyncMock(return_value="Lỗi ngữ pháp: thiếu động từ"),
    )

    from agents.agt04_feedback.service import analyze_speaking_turn
    result = await analyze_speaking_turn("I go school", "sess-1", "user-1", 5.0)

    assert len(result["grammar_errors"]) == 1
    expl = result["grammar_errors"][0]["explanation"]
    assert expl is not None
    assert any(ord(c) > 127 for c in expl), (
        f"Expected Vietnamese Unicode in explanation, got: {expl!r}"
    )


async def test_speaking_turn_explanation_none_when_agt11_fails(monkeypatch):
    """AGT-11 failure must not raise — explanation is None."""
    monkeypatch.setattr(
        "agents.agt04_feedback.service.grammar.analyze_grammar",
        AsyncMock(return_value=[{"errorType": "grammar", "severity": 1}]),
    )
    monkeypatch.setattr("agents.agt04_feedback.service.record_error", AsyncMock())
    monkeypatch.setattr(
        "agents.agt04_feedback.service._get_bilingual_explanation",
        AsyncMock(return_value=None),
    )

    from agents.agt04_feedback.service import analyze_speaking_turn
    result = await analyze_speaking_turn("I go school", "sess-1", "user-1", 5.0)

    assert result["grammar_errors"][0]["explanation"] is None

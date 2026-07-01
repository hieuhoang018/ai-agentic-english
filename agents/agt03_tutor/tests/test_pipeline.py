from unittest.mock import AsyncMock
from agents.agt03_tutor import pipeline


async def test_run_turn_pipeline_delegates_to_process_turn(monkeypatch):
    """run_turn_pipeline is a thin wrapper — it must call service.process_turn with
    the same arguments and return its result unchanged."""
    fake_result = {"session_id": "abc", "assistant_message": "Good job!"}
    fake_process_turn = AsyncMock(return_value=fake_result)
    monkeypatch.setattr(pipeline, "process_turn", fake_process_turn)

    result = await pipeline.run_turn_pipeline("abc", "hello", None)

    fake_process_turn.assert_awaited_once_with("abc", "hello", None)
    assert result == fake_result


async def test_run_turn_pipeline_propagates_value_error(monkeypatch):
    """If process_turn raises (e.g. unknown session), the pipeline must not swallow it."""
    async def failing_process_turn(*args):
        raise ValueError("process_turn: session 'xyz' is not active")

    monkeypatch.setattr(pipeline, "process_turn", failing_process_turn)

    import pytest
    with pytest.raises(ValueError, match="not active"):
        await pipeline.run_turn_pipeline("xyz", "hi", None)

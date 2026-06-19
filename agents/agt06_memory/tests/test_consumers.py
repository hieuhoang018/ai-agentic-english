from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from agents.agt06_memory import consumers


async def test_handle_session_end_triggers_consolidation(monkeypatch):
    mock_consolidate = AsyncMock(return_value=True)
    monkeypatch.setattr(consumers, "consolidate_session", mock_consolidate)

    await consumers.handle_session_end("session.end", {
        "sessionId": "sess1",
        "clerkUserId": "user1",
        "skillFocus": "SPEAKING",
        "durationMinutes": 20,
    })

    mock_consolidate.assert_awaited_once_with("sess1", "user1", "SPEAKING")


async def test_handle_session_end_missing_session_id_is_noop(monkeypatch):
    mock_consolidate = AsyncMock()
    monkeypatch.setattr(consumers, "consolidate_session", mock_consolidate)

    await consumers.handle_session_end("session.end", {
        "clerkUserId": "user1",
        "skillFocus": "SPEAKING",
    })

    mock_consolidate.assert_not_awaited()


async def test_handle_session_end_missing_clerk_user_id_is_noop(monkeypatch):
    mock_consolidate = AsyncMock()
    monkeypatch.setattr(consumers, "consolidate_session", mock_consolidate)

    await consumers.handle_session_end("session.end", {
        "sessionId": "sess1",
        "skillFocus": "SPEAKING",
    })

    mock_consolidate.assert_not_awaited()


async def test_handle_session_end_consolidation_error_is_caught(monkeypatch):
    mock_consolidate = AsyncMock(side_effect=RuntimeError("DB down"))
    monkeypatch.setattr(consumers, "consolidate_session", mock_consolidate)

    # Must not raise — consumer must not crash the loop on a single bad event
    await consumers.handle_session_end("session.end", {
        "sessionId": "sess1",
        "clerkUserId": "user1",
        "skillFocus": "SPEAKING",
    })


async def test_start_consumers_returns_cancellable_tasks(monkeypatch):
    async def fake_consume(topics, group_id, handler):
        await asyncio.sleep(3600)

    monkeypatch.setattr(consumers, "consume", fake_consume)

    tasks = await consumers.start_consumers()

    assert len(tasks) == 1
    assert isinstance(tasks[0], asyncio.Task)
    tasks[0].cancel()
    await asyncio.gather(*tasks, return_exceptions=True)

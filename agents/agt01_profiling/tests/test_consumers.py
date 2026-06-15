from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from agents.agt01_profiling import consumers


async def test_handle_session_end_updates_behavioral_profile(monkeypatch):
    mock_get_base = AsyncMock(return_value={
        "clerk_user_id": "user1",
        "behavioral_profile": {},
    })
    mock_update = AsyncMock(return_value={})
    monkeypatch.setattr(consumers, "_get_base_profile", mock_get_base)
    monkeypatch.setattr(consumers, "update_profile", mock_update)

    await consumers.handle_session_end("agent.session.end", {
        "clerkUserId": "user1",
        "durationMinutes": 20,
    })

    mock_update.assert_awaited_once()
    clerk_user_id, updates = mock_update.call_args.args
    assert clerk_user_id == "user1"
    assert updates["behavioral_profile"]["avg_session_length"] == 20.0
    assert updates["cold_start_flag"] is False


async def test_handle_session_end_seeds_ewma_on_second_session(monkeypatch):
    mock_get_base = AsyncMock(return_value={
        "clerk_user_id": "user1",
        "behavioral_profile": {"avg_session_length": 20.0},
    })
    mock_update = AsyncMock(return_value={})
    monkeypatch.setattr(consumers, "_get_base_profile", mock_get_base)
    monkeypatch.setattr(consumers, "update_profile", mock_update)

    await consumers.handle_session_end("agent.session.end", {
        "clerkUserId": "user1",
        "durationMinutes": 10,
    })

    _, updates = mock_update.call_args.args
    # EWMA_ALPHA=0.3: 0.3*10 + 0.7*20 = 17.0
    assert updates["behavioral_profile"]["avg_session_length"] == 17.0


async def test_handle_session_end_missing_fields_is_noop(monkeypatch):
    mock_update = AsyncMock()
    monkeypatch.setattr(consumers, "update_profile", mock_update)

    await consumers.handle_session_end("agent.session.end", {"clerkUserId": "user1"})

    mock_update.assert_not_awaited()


async def test_handle_error_event_accumulates_severity(monkeypatch):
    mock_get_base = AsyncMock(return_value={
        "clerk_user_id": "user1",
        "grammar_error_map": {"SPEAKING": {"verb_tense": 1.0}},
    })
    mock_update = AsyncMock(return_value={})
    monkeypatch.setattr(consumers, "_get_base_profile", mock_get_base)
    monkeypatch.setattr(consumers, "update_profile", mock_update)

    await consumers.handle_error_event("agent.errors", {
        "clerkUserId": "user1",
        "sessionId": "sess1",
        "error": {
            "skill_domain": "SPEAKING",
            "error_type": "verb_tense",
            "severity": 2,
        },
    })

    _, updates = mock_update.call_args.args
    assert updates["grammar_error_map"]["SPEAKING"]["verb_tense"] == 3.0


async def test_handle_error_event_new_skill_and_error_type(monkeypatch):
    mock_get_base = AsyncMock(return_value={
        "clerk_user_id": "user1",
        "grammar_error_map": {"SPEAKING": {"verb_tense": 1.0}},
    })
    mock_update = AsyncMock(return_value={})
    monkeypatch.setattr(consumers, "_get_base_profile", mock_get_base)
    monkeypatch.setattr(consumers, "update_profile", mock_update)

    await consumers.handle_error_event("agent.errors", {
        "clerkUserId": "user1",
        "sessionId": "sess1",
        "error": {
            "skill_domain": "WRITING",
            "error_type": "article_usage",
            "severity": 1,
        },
    })

    _, updates = mock_update.call_args.args
    # existing SPEAKING map is preserved, WRITING is added
    assert updates["grammar_error_map"]["SPEAKING"]["verb_tense"] == 1.0
    assert updates["grammar_error_map"]["WRITING"]["article_usage"] == 1.0


async def test_handle_error_event_missing_clerk_user_id_is_noop(monkeypatch):
    mock_update = AsyncMock()
    monkeypatch.setattr(consumers, "update_profile", mock_update)

    await consumers.handle_error_event("agent.errors", {
        "sessionId": "sess1",
        "error": {"skill_domain": "SPEAKING", "error_type": "x", "severity": 1},
    })

    mock_update.assert_not_awaited()


async def test_start_consumers_returns_cancellable_tasks(monkeypatch):
    async def fake_consume(topics, group_id, handler):
        await asyncio.sleep(3600)

    monkeypatch.setattr(consumers, "consume", fake_consume)

    tasks = await consumers.start_consumers()

    assert len(tasks) == 2
    for task in tasks:
        assert isinstance(task, asyncio.Task)
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)

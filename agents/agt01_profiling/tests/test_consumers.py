from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import fakeredis.aioredis
import pytest

from agents.agt01_profiling import consumers


@pytest.fixture()
def fake_redis(monkeypatch):
    fake = fakeredis.aioredis.FakeRedis()

    async def fake_get_redis():
        return fake

    monkeypatch.setattr(consumers, "get_redis", fake_get_redis)
    return fake


async def test_handle_session_end_updates_behavioral_profile(monkeypatch):
    mock_get_base = AsyncMock(return_value={
        "clerk_user_id": "user1",
        "behavioral_profile": {},
    })
    mock_update = AsyncMock(return_value={})
    monkeypatch.setattr(consumers, "_get_base_profile", mock_get_base)
    monkeypatch.setattr(consumers, "update_profile", mock_update)

    await consumers.handle_session_end("session.end", {
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

    await consumers.handle_session_end("session.end", {
        "clerkUserId": "user1",
        "durationMinutes": 10,
    })

    _, updates = mock_update.call_args.args
    # EWMA_ALPHA=0.3: 0.3*10 + 0.7*20 = 17.0
    assert updates["behavioral_profile"]["avg_session_length"] == 17.0


async def test_handle_session_end_missing_fields_is_noop(monkeypatch):
    mock_update = AsyncMock()
    monkeypatch.setattr(consumers, "update_profile", mock_update)

    await consumers.handle_session_end("session.end", {"clerkUserId": "user1"})

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


async def test_handle_session_end_with_session_id_is_idempotent(monkeypatch, fake_redis):
    mock_get_base = AsyncMock(return_value={"clerk_user_id": "user1", "behavioral_profile": {}})
    mock_update = AsyncMock(return_value={})
    monkeypatch.setattr(consumers, "_get_base_profile", mock_get_base)
    monkeypatch.setattr(consumers, "update_profile", mock_update)
    monkeypatch.setattr(consumers, "_get_session_error_count", AsyncMock(return_value=0))

    event = {"clerkUserId": "user1", "durationMinutes": 20, "sessionId": "sess-abc"}

    await consumers.handle_session_end("session.end", event)
    await consumers.handle_session_end("session.end", event)

    # update_profile must be called exactly once — the second delivery is skipped
    mock_update.assert_awaited_once()


async def test_handle_session_end_without_session_id_always_processes(monkeypatch):
    # No sessionId → no dedup key → no Redis access needed → both calls process
    mock_get_base = AsyncMock(return_value={"clerk_user_id": "user1", "behavioral_profile": {}})
    mock_update = AsyncMock(return_value={})
    monkeypatch.setattr(consumers, "_get_base_profile", mock_get_base)
    monkeypatch.setattr(consumers, "update_profile", mock_update)

    event = {"clerkUserId": "user1", "durationMinutes": 20}

    await consumers.handle_session_end("session.end", event)
    await consumers.handle_session_end("session.end", event)

    assert mock_update.await_count == 2


async def test_handle_session_end_dedup_key_is_written_atomically(monkeypatch, fake_redis):
    """Verify the dedup key is written atomically and a second call is skipped."""
    mock_update = AsyncMock(return_value={})
    mock_get_base = AsyncMock(return_value={"clerk_user_id": "user1", "behavioral_profile": {}})
    monkeypatch.setattr(consumers, "update_profile", mock_update)
    monkeypatch.setattr(consumers, "_get_base_profile", mock_get_base)
    monkeypatch.setattr(consumers, "_get_session_error_count", AsyncMock(return_value=0))

    event = {"clerkUserId": "user1", "durationMinutes": 15, "sessionId": "sess-atomic"}

    # First call — should process and set dedup key
    await consumers.handle_session_end("session.end", event)
    assert mock_update.await_count == 1

    # Dedup key must now exist in fake Redis
    key_exists = await fake_redis.exists(b"agt01:processed:session_end:sess-atomic")
    assert key_exists, "Dedup key must be written after processing"

    # Second call — dedup key present, must skip
    await consumers.handle_session_end("session.end", event)
    assert mock_update.await_count == 1, "update_profile must not be called a second time"


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


# ── IRT theta update tests ────────────────────────────────────────────────────

async def test_handle_session_end_updates_irt_theta_no_errors(monkeypatch, fake_redis):
    """0 errors → score 1.0 → theta_new = 0.0 + 0.1*(1.0-0.5) = 0.05 for skill_focus SPEAKING (key S)."""
    mock_get_base = AsyncMock(return_value={
        "clerk_user_id": "user1",
        "behavioral_profile": {},
        "irt_theta": {"L": 0.0, "S": 0.0, "R": 0.0, "W": 0.0},
    })
    mock_update = AsyncMock(return_value={})
    monkeypatch.setattr(consumers, "_get_base_profile", mock_get_base)
    monkeypatch.setattr(consumers, "update_profile", mock_update)
    monkeypatch.setattr(consumers, "_get_session_error_count", AsyncMock(return_value=0))

    await consumers.handle_session_end("session.end", {
        "clerkUserId": "user1",
        "durationMinutes": 20,
        "sessionId": "sess-clean",
        "skillFocus": "SPEAKING",
    })

    mock_update.assert_awaited_once()
    _, updates = mock_update.call_args.args
    assert "irt_theta" in updates
    assert updates["irt_theta"]["S"] == 0.05
    # Sibling skill keys must be unchanged
    assert updates["irt_theta"]["L"] == 0.0
    assert updates["irt_theta"]["R"] == 0.0
    assert updates["irt_theta"]["W"] == 0.0


async def test_handle_session_end_updates_irt_theta_many_errors(monkeypatch, fake_redis):
    """10 errors → score 0.1 → theta_new = 0.0 + 0.1*(0.1-0.5) = -0.04 for LISTENING (key L)."""
    mock_get_base = AsyncMock(return_value={
        "clerk_user_id": "user1",
        "behavioral_profile": {},
        "irt_theta": {"L": 0.0, "S": 0.0, "R": 0.0, "W": 0.0},
    })
    mock_update = AsyncMock(return_value={})
    monkeypatch.setattr(consumers, "_get_base_profile", mock_get_base)
    monkeypatch.setattr(consumers, "update_profile", mock_update)
    monkeypatch.setattr(consumers, "_get_session_error_count", AsyncMock(return_value=10))

    await consumers.handle_session_end("session.end", {
        "clerkUserId": "user1",
        "durationMinutes": 10,
        "sessionId": "sess-hard",
        "skillFocus": "LISTENING",
    })

    _, updates = mock_update.call_args.args
    assert "irt_theta" in updates
    assert updates["irt_theta"]["L"] == -0.04
    assert updates["irt_theta"]["S"] == 0.0  # other keys untouched


async def test_handle_session_end_irt_failure_does_not_block_behavioral(monkeypatch, fake_redis):
    """If _get_session_error_count raises, behavioral update must still be written."""
    mock_get_base = AsyncMock(return_value={
        "clerk_user_id": "user1",
        "behavioral_profile": {},
    })
    mock_update = AsyncMock(return_value={})
    monkeypatch.setattr(consumers, "_get_base_profile", mock_get_base)
    monkeypatch.setattr(consumers, "update_profile", mock_update)

    async def _raise(_session_id: str) -> int:
        raise RuntimeError("AGT-06 unreachable")

    monkeypatch.setattr(consumers, "_get_session_error_count", _raise)

    await consumers.handle_session_end("session.end", {
        "clerkUserId": "user1",
        "durationMinutes": 15,
        "sessionId": "sess-fail",
        "skillFocus": "WRITING",
    })

    # update_profile must still be called with behavioral data
    mock_update.assert_awaited_once()
    _, updates = mock_update.call_args.args
    assert updates["cold_start_flag"] is False
    assert "avg_session_length" in updates["behavioral_profile"]
    # irt_theta must NOT be in the update when IRT block fails
    assert "irt_theta" not in updates

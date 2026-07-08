from datetime import date

import pytest
import fakeredis.aioredis
from unittest.mock import AsyncMock


@pytest.fixture(autouse=True)
def patch_emit_ts_event(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr("agents.agt10_habit.service.emit_ts_event", mock)
    return mock


@pytest.fixture
def fake_redis(monkeypatch):
    """Real Redis command semantics via fakeredis, matching the pattern used
    in agents/agt01_profiling/tests/test_consumers.py and
    agents/agt10_habit/tests/test_main.py."""
    fake = fakeredis.aioredis.FakeRedis()

    async def fake_get_redis():
        return fake

    monkeypatch.setattr("agents.agt10_habit.service.get_redis", fake_get_redis)
    return fake


def set_today(monkeypatch, iso_date: str):
    monkeypatch.setattr("agents.agt10_habit.service._today", lambda: date.fromisoformat(iso_date))


# ── send_milestone ────────────────────────────────────────────────────────────

async def test_send_milestone_7_day_streak_emits_achievement_unlocked(patch_emit_ts_event):
    from agents.agt10_habit.service import send_milestone

    await send_milestone("user_abc", "7-day streak")

    patch_emit_ts_event.assert_called_once_with(
        "achievement.unlocked",
        "achievement.unlocked",
        {"userId": "user_abc", "achievementType": "7-day-streak", "metadata": {}},
        key="user_abc",
    )


async def test_send_milestone_30_day_streak_emits_achievement_unlocked(patch_emit_ts_event):
    from agents.agt10_habit.service import send_milestone

    await send_milestone("user_abc", "30-day streak")

    patch_emit_ts_event.assert_called_once_with(
        "achievement.unlocked",
        "achievement.unlocked",
        {"userId": "user_abc", "achievementType": "30-day-streak", "metadata": {}},
        key="user_abc",
    )


async def test_send_milestone_100_day_streak_emits_achievement_unlocked(patch_emit_ts_event):
    from agents.agt10_habit.service import send_milestone

    await send_milestone("user_abc", "100-day streak")

    patch_emit_ts_event.assert_called_once_with(
        "achievement.unlocked",
        "achievement.unlocked",
        {"userId": "user_abc", "achievementType": "100-day-streak", "metadata": {}},
        key="user_abc",
    )


async def test_send_milestone_unrecognised_name_does_not_emit(patch_emit_ts_event):
    from agents.agt10_habit.service import send_milestone

    await send_milestone("user_abc", "365-day streak")

    patch_emit_ts_event.assert_not_called()


# ── record_session_complete + Redis streak ────────────────────────────────────

async def test_record_session_complete_first_ever_session_sets_streak_to_1(fake_redis, patch_emit_ts_event, monkeypatch):
    from agents.agt10_habit.service import record_session_complete

    set_today(monkeypatch, "2026-07-07")

    result = await record_session_complete("user_abc", "sess-1")

    assert result == {"streak": 1, "session_recorded": True}


async def test_record_session_complete_second_session_same_day_is_noop(fake_redis, patch_emit_ts_event, monkeypatch):
    """This is the exact bug being fixed: opening/reloading the AI Tutor
    multiple times in one day (or genuinely practicing twice in one day)
    must not push the streak past 1 for that day."""
    from agents.agt10_habit.service import record_session_complete

    set_today(monkeypatch, "2026-07-07")

    await record_session_complete("user_abc", "sess-1")
    result = await record_session_complete("user_abc", "sess-2")

    assert result == {"streak": 1, "session_recorded": True}


async def test_record_session_complete_next_consecutive_day_increments(fake_redis, patch_emit_ts_event, monkeypatch):
    from agents.agt10_habit.service import record_session_complete

    set_today(monkeypatch, "2026-07-06")
    await record_session_complete("user_abc", "sess-1")

    set_today(monkeypatch, "2026-07-07")
    result = await record_session_complete("user_abc", "sess-2")

    assert result == {"streak": 2, "session_recorded": True}


async def test_record_session_complete_gap_of_two_days_resets_to_1(fake_redis, patch_emit_ts_event, monkeypatch):
    from agents.agt10_habit.service import record_session_complete

    set_today(monkeypatch, "2026-07-01")
    await record_session_complete("user_abc", "sess-1")

    set_today(monkeypatch, "2026-07-04")  # 3-day gap since last active day -> streak was broken
    result = await record_session_complete("user_abc", "sess-2")

    assert result == {"streak": 1, "session_recorded": True}


async def test_record_session_complete_recovers_from_corrupt_count_field(fake_redis, patch_emit_ts_event, monkeypatch):
    """A corrupted (non-numeric) count field must not crash the consumer —
    it should be treated like 'no prior record' and reset to 1."""
    from agents.agt10_habit.service import _streak_key, record_session_complete

    await fake_redis.hset(_streak_key("user_abc"), mapping={"count": "not-a-number", "last_active_date": "2026-07-06"})
    set_today(monkeypatch, "2026-07-07")

    result = await record_session_complete("user_abc", "sess-1")

    assert result == {"streak": 1, "session_recorded": True}


async def test_record_session_complete_recovers_from_corrupt_last_active_date_field(fake_redis, patch_emit_ts_event, monkeypatch):
    """A corrupted (non-ISO-date) last_active_date field must not crash the
    consumer — it should be treated like 'no prior record' and reset to 1."""
    from agents.agt10_habit.service import _streak_key, record_session_complete

    await fake_redis.hset(_streak_key("user_abc"), mapping={"count": 6, "last_active_date": "not-a-date"})
    set_today(monkeypatch, "2026-07-07")

    result = await record_session_complete("user_abc", "sess-1")

    assert result == {"streak": 1, "session_recorded": True}


async def test_record_session_complete_duplicate_session_id_is_not_double_counted(fake_redis, patch_emit_ts_event, monkeypatch):
    """Kafka delivery is at-least-once; a redelivered session.end for the
    same sessionId must not increment the streak a second time."""
    from agents.agt10_habit.service import record_session_complete

    set_today(monkeypatch, "2026-07-07")
    first = await record_session_complete("user_abc", "sess-1")
    second = await record_session_complete("user_abc", "sess-1")  # redelivery

    assert first == {"streak": 1, "session_recorded": True}
    assert second == {"streak": 1, "session_recorded": False}


async def test_record_session_complete_streak_7_emits_achievement(fake_redis, patch_emit_ts_event, monkeypatch):
    from agents.agt10_habit.service import record_session_complete, _streak_key

    await fake_redis.hset(_streak_key("user_abc"), mapping={"count": 6, "last_active_date": "2026-07-06"})
    set_today(monkeypatch, "2026-07-07")

    result = await record_session_complete("user_abc", "sess-1")

    assert result["streak"] == 7
    patch_emit_ts_event.assert_called_once_with(
        "achievement.unlocked",
        "achievement.unlocked",
        {"userId": "user_abc", "achievementType": "7-day-streak", "metadata": {}},
        key="user_abc",
    )


async def test_record_session_complete_streak_30_emits_achievement(fake_redis, patch_emit_ts_event, monkeypatch):
    from agents.agt10_habit.service import record_session_complete, _streak_key

    await fake_redis.hset(_streak_key("user_abc"), mapping={"count": 29, "last_active_date": "2026-07-06"})
    set_today(monkeypatch, "2026-07-07")

    result = await record_session_complete("user_abc", "sess-1")

    assert result["streak"] == 30
    patch_emit_ts_event.assert_called_once_with(
        "achievement.unlocked",
        "achievement.unlocked",
        {"userId": "user_abc", "achievementType": "30-day-streak", "metadata": {}},
        key="user_abc",
    )


async def test_record_session_complete_streak_100_emits_achievement(fake_redis, patch_emit_ts_event, monkeypatch):
    from agents.agt10_habit.service import record_session_complete, _streak_key

    await fake_redis.hset(_streak_key("user_abc"), mapping={"count": 99, "last_active_date": "2026-07-06"})
    set_today(monkeypatch, "2026-07-07")

    result = await record_session_complete("user_abc", "sess-1")

    assert result["streak"] == 100
    patch_emit_ts_event.assert_called_once_with(
        "achievement.unlocked",
        "achievement.unlocked",
        {"userId": "user_abc", "achievementType": "100-day-streak", "metadata": {}},
        key="user_abc",
    )


async def test_record_session_complete_non_milestone_does_not_emit(fake_redis, patch_emit_ts_event, monkeypatch):
    from agents.agt10_habit.service import record_session_complete, _streak_key

    await fake_redis.hset(_streak_key("user_abc"), mapping={"count": 3, "last_active_date": "2026-07-06"})
    set_today(monkeypatch, "2026-07-07")

    result = await record_session_complete("user_abc", "sess-1")

    assert result["streak"] == 4
    patch_emit_ts_event.assert_not_called()


async def test_record_session_complete_second_session_on_milestone_day_does_not_refire(fake_redis, patch_emit_ts_event, monkeypatch):
    """A second qualifying session on the same day a milestone was already
    hit must not re-emit the achievement."""
    from agents.agt10_habit.service import record_session_complete, _streak_key

    await fake_redis.hset(_streak_key("user_abc"), mapping={"count": 6, "last_active_date": "2026-07-06"})
    set_today(monkeypatch, "2026-07-07")

    await record_session_complete("user_abc", "sess-1")
    patch_emit_ts_event.reset_mock()
    result = await record_session_complete("user_abc", "sess-2")

    assert result == {"streak": 7, "session_recorded": True}
    patch_emit_ts_event.assert_not_called()


# ── get_streak ─────────────────────────────────────────────────────────────────

async def test_get_streak_returns_zero_when_no_redis_state(fake_redis):
    from agents.agt10_habit.service import get_streak

    result = await get_streak("user_new")
    assert result == 0


async def test_get_streak_returns_persisted_value(fake_redis):
    from agents.agt10_habit.service import get_streak, _streak_key

    await fake_redis.hset(_streak_key("user_abc"), mapping={"count": 12, "last_active_date": "2026-07-06"})

    result = await get_streak("user_abc")
    assert result == 12

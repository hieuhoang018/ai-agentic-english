import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture(autouse=True)
def patch_emit_ts_event(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr("agents.agt10_habit.service.emit_ts_event", mock)
    return mock


@pytest.fixture
def fake_redis(monkeypatch):
    """Minimal Redis mock backed by a plain dict."""
    store: dict[str, int] = {}

    redis_mock = MagicMock()

    async def fake_get(k):
        v = store.get(k)
        return str(v).encode() if v is not None else None

    async def fake_set(k, v):
        store[k] = int(v)

    async def fake_setnx(k, v):
        if k not in store:
            store[k] = int(v)
            return True
        return False

    async def fake_incr(k):
        store[k] = store.get(k, 0) + 1
        return store[k]

    redis_mock.get = AsyncMock(side_effect=fake_get)
    redis_mock.set = AsyncMock(side_effect=fake_set)
    redis_mock.setnx = AsyncMock(side_effect=fake_setnx)
    redis_mock.incr = AsyncMock(side_effect=fake_incr)

    monkeypatch.setattr(
        "agents.agt10_habit.service.get_redis",
        AsyncMock(return_value=redis_mock),
    )
    return store


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

async def test_record_session_complete_increments_from_zero_when_no_redis_state(fake_redis, patch_emit_ts_event):
    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_abc", current_streak=0, session_duration_minutes=15)
    assert result["streak"] == 1


async def test_record_session_complete_uses_redis_state_over_param(fake_redis, patch_emit_ts_event):
    """Redis stored streak=5 overrides current_streak=0 arg."""
    fake_redis["streak:user_abc"] = 5

    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_abc", current_streak=0, session_duration_minutes=15)
    assert result["streak"] == 6


async def test_record_session_complete_streak_7_emits_achievement(fake_redis, patch_emit_ts_event):
    fake_redis["streak:user_abc"] = 6

    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_abc", current_streak=6, session_duration_minutes=15)

    assert result["streak"] == 7
    patch_emit_ts_event.assert_called_once_with(
        "achievement.unlocked",
        "achievement.unlocked",
        {"userId": "user_abc", "achievementType": "7-day-streak", "metadata": {}},
        key="user_abc",
    )


async def test_record_session_complete_streak_30_emits_achievement(fake_redis, patch_emit_ts_event):
    fake_redis["streak:user_abc"] = 29

    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_abc", current_streak=29, session_duration_minutes=15)

    assert result["streak"] == 30
    patch_emit_ts_event.assert_called_once_with(
        "achievement.unlocked",
        "achievement.unlocked",
        {"userId": "user_abc", "achievementType": "30-day-streak", "metadata": {}},
        key="user_abc",
    )


async def test_record_session_complete_streak_100_emits_achievement(fake_redis, patch_emit_ts_event):
    fake_redis["streak:user_abc"] = 99

    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_abc", current_streak=99, session_duration_minutes=15)

    assert result["streak"] == 100
    patch_emit_ts_event.assert_called_once_with(
        "achievement.unlocked",
        "achievement.unlocked",
        {"userId": "user_abc", "achievementType": "100-day-streak", "metadata": {}},
        key="user_abc",
    )


async def test_record_session_complete_non_milestone_does_not_emit(fake_redis, patch_emit_ts_event):
    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_abc", current_streak=3, session_duration_minutes=10)

    assert result["streak"] == 4
    patch_emit_ts_event.assert_not_called()


async def test_get_streak_returns_zero_when_no_redis_state(fake_redis):
    from agents.agt10_habit.service import get_streak

    result = await get_streak("user_new")
    assert result == 0


async def test_get_streak_returns_persisted_value(fake_redis):
    fake_redis["streak:user_abc"] = 12

    from agents.agt10_habit.service import get_streak

    result = await get_streak("user_abc")
    assert result == 12


async def test_record_session_complete_redis_is_authoritative_over_current_streak(fake_redis, patch_emit_ts_event):
    """Redis at 5 wins over current_streak=0."""
    fake_redis["streak:user_a"] = 5

    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_a", current_streak=0, session_duration_minutes=30.0)
    assert result["streak"] == 6


async def test_record_session_complete_seeds_from_current_streak_when_no_redis_key(fake_redis, patch_emit_ts_event):
    """No Redis key → seeds from current_streak=3 via setnx, then increments to 4."""
    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_b", current_streak=3, session_duration_minutes=10.0)
    assert result["streak"] == 4


async def test_record_session_complete_milestone_7_fires_when_redis_crosses_threshold(fake_redis, patch_emit_ts_event):
    """Redis at 6 → after increment streak=7 → 7-day-streak achievement emitted."""
    fake_redis["streak:user_c"] = 6

    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_c", current_streak=6, session_duration_minutes=10.0)
    assert result["streak"] == 7
    patch_emit_ts_event.assert_called_once_with(
        "achievement.unlocked",
        "achievement.unlocked",
        {"userId": "user_c", "achievementType": "7-day-streak", "metadata": {}},
        key="user_c",
    )

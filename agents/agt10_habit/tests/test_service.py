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
    store: dict[str, bytes] = {}

    redis_mock = MagicMock()
    redis_mock.get = AsyncMock(side_effect=lambda k: store.get(k))
    redis_mock.set = AsyncMock(side_effect=lambda k, v: store.update({k: v}))

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


async def test_send_milestone_30_day_streak_does_not_emit(patch_emit_ts_event):
    from agents.agt10_habit.service import send_milestone

    await send_milestone("user_abc", "30-day streak")

    patch_emit_ts_event.assert_not_called()


async def test_send_milestone_100_day_streak_does_not_emit(patch_emit_ts_event):
    from agents.agt10_habit.service import send_milestone

    await send_milestone("user_abc", "100-day streak")

    patch_emit_ts_event.assert_not_called()


# ── check_re_engagement escalation ───────────────────────────────────────────

async def test_check_re_engagement_returns_daily_reminder_after_1_day():
    from agents.agt10_habit.service import check_re_engagement

    result = await check_re_engagement("user_abc", days_since_last_session=1)
    assert result == "daily-reminder"


async def test_check_re_engagement_returns_nudge_after_3_days():
    from agents.agt10_habit.service import check_re_engagement

    result = await check_re_engagement("user_abc", days_since_last_session=3)
    assert result == "re-engagement-nudge"


async def test_check_re_engagement_returns_weekly_summary_after_7_days():
    from agents.agt10_habit.service import check_re_engagement

    result = await check_re_engagement("user_abc", days_since_last_session=7)
    assert result == "weekly-progress-summary"


async def test_check_re_engagement_returns_none_when_active():
    from agents.agt10_habit.service import check_re_engagement

    result = await check_re_engagement("user_abc", days_since_last_session=0)
    assert result is None


async def test_check_re_engagement_risk_score_overrides_active():
    """risk_score > 0.7 triggers proactive-intervention even when days_since=0."""
    from agents.agt10_habit.service import check_re_engagement

    result = await check_re_engagement("user_abc", days_since_last_session=0, risk_score=0.8)
    assert result == "proactive-intervention"


async def test_check_re_engagement_risk_score_overrides_day_based():
    """risk_score > 0.7 takes priority over day-based escalation."""
    from agents.agt10_habit.service import check_re_engagement

    result = await check_re_engagement("user_abc", days_since_last_session=3, risk_score=0.9)
    assert result == "proactive-intervention"


async def test_check_re_engagement_low_risk_score_does_not_override():
    """risk_score <= 0.7 does not trigger proactive-intervention."""
    from agents.agt10_habit.service import check_re_engagement

    result = await check_re_engagement("user_abc", days_since_last_session=0, risk_score=0.5)
    assert result is None


# ── record_session_complete + Redis streak ────────────────────────────────────

async def test_record_session_complete_increments_from_zero_when_no_redis_state(fake_redis, patch_emit_ts_event):
    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_abc", current_streak=0, session_duration_minutes=15)
    assert result["streak"] == 1


async def test_record_session_complete_uses_redis_state_over_param(fake_redis, patch_emit_ts_event):
    """Redis stored streak=5 overrides current_streak=0 arg."""
    fake_redis["streak:user_abc"] = b"5"

    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_abc", current_streak=0, session_duration_minutes=15)
    assert result["streak"] == 6


async def test_record_session_complete_streak_7_emits_achievement(fake_redis, patch_emit_ts_event):
    fake_redis["streak:user_abc"] = b"6"

    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_abc", current_streak=6, session_duration_minutes=15)

    assert result["streak"] == 7
    patch_emit_ts_event.assert_called_once_with(
        "achievement.unlocked",
        "achievement.unlocked",
        {"userId": "user_abc", "achievementType": "7-day-streak", "metadata": {}},
        key="user_abc",
    )


async def test_record_session_complete_streak_30_does_not_emit(fake_redis, patch_emit_ts_event):
    fake_redis["streak:user_abc"] = b"29"

    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_abc", current_streak=29, session_duration_minutes=15)

    assert result["streak"] == 30
    patch_emit_ts_event.assert_not_called()


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
    fake_redis["streak:user_abc"] = b"12"

    from agents.agt10_habit.service import get_streak

    result = await get_streak("user_abc")
    assert result == 12

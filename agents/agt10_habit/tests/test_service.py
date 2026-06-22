import pytest
from unittest.mock import AsyncMock, patch


@pytest.fixture(autouse=True)
def patch_emit_ts_event(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr("agents.agt10_habit.service.emit_ts_event", mock)
    return mock


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


async def test_check_re_engagement_always_returns_none(patch_emit_ts_event):
    from agents.agt10_habit.service import check_re_engagement

    result = await check_re_engagement("user_abc", days_since_last_session=7)

    assert result is None
    patch_emit_ts_event.assert_not_called()


async def test_record_session_complete_streak_7_emits_achievement(patch_emit_ts_event):
    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_abc", current_streak=6, session_duration_minutes=15)

    assert result["streak"] == 7
    patch_emit_ts_event.assert_called_once_with(
        "achievement.unlocked",
        "achievement.unlocked",
        {"userId": "user_abc", "achievementType": "7-day-streak", "metadata": {}},
        key="user_abc",
    )


async def test_record_session_complete_streak_30_does_not_emit(patch_emit_ts_event):
    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_abc", current_streak=29, session_duration_minutes=15)

    assert result["streak"] == 30
    patch_emit_ts_event.assert_not_called()


async def test_record_session_complete_non_milestone_does_not_emit(patch_emit_ts_event):
    from agents.agt10_habit.service import record_session_complete

    result = await record_session_complete("user_abc", current_streak=3, session_duration_minutes=10)

    assert result["streak"] == 4
    patch_emit_ts_event.assert_not_called()

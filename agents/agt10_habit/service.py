"""
Habit Building Agent service.
Manages streak tracking and milestone notifications via Kafka.
Re-engagement notifications are handled by notification-service's cron scheduler — not here.
"""

import logging
from agents.shared.events.producer import emit_ts_event

logger = logging.getLogger(__name__)

_ACHIEVEMENT_TYPE_MAP = {
    "7-day streak": "7-day-streak",
    "first-lesson": "first-lesson",
    # "level-up" is the third AchievementType in the TS shared package but has no producer here:
    # it represents a CEFR level advancement (A1→A2, etc.) and belongs in AGT-05 (assessment)
    # once IRT theta thresholds are defined. Tracked in: TODO implement level-up in AGT-05.
}


async def check_re_engagement(
    clerk_user_id: str,
    days_since_last_session: int,
    risk_score: float = 0.0,
    streak_days: int = 0,
    review_due_count: int = 0,
) -> str | None:
    """
    No-op. Re-engagement notifications (daily-reminder, re-engagement-nudge,
    weekly-progress-summary) are sent by notification-service's cron scheduler,
    which fetches context from AGT-07. AGT-10 must not duplicate those calls.
    """
    return None


async def send_milestone(clerk_user_id: str, milestone_name: str) -> None:
    """
    Emit achievement.unlocked Kafka event if the milestone maps to a known AchievementType.
    Unknown milestones (e.g. '30-day streak', '100-day streak') are silently skipped —
    add them to _ACHIEVEMENT_TYPE_MAP and the TS AchievementType union when Novu templates exist.
    """
    achievement_type = _ACHIEVEMENT_TYPE_MAP.get(milestone_name)
    if achievement_type is None:
        logger.info("Skipping Kafka emit for unrecognised milestone=%s", milestone_name)
        return
    await emit_ts_event(
        "achievement.unlocked",
        "achievement.unlocked",
        {"userId": clerk_user_id, "achievementType": achievement_type, "metadata": {}},
        key=clerk_user_id,
    )


async def record_session_complete(
    clerk_user_id: str,
    current_streak: int,
    session_duration_minutes: float,
) -> dict:
    """
    Process a completed session for streak and goal tracking.
    TODO Phase 8+: persist streak state to LTM, check daily goal completion.
    """
    new_streak = current_streak + 1

    if new_streak in (7, 30, 100):
        await send_milestone(clerk_user_id, f"{new_streak}-day streak")

    return {
        "streak": new_streak,
        "session_recorded": True,
    }

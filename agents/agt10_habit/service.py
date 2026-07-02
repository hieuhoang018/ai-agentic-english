"""
Habit Building Agent service.
Manages streak tracking and milestone notifications via Kafka.
Absence-based reminders (daily-reminder, etc.) are owned by
notification-service's dailyReminder.ts scheduler, which pulls context
from AGT-07 directly — this agent does not compute or trigger those.
"""

import logging
from agents.shared.db.redis_client import get_redis
from agents.shared.events.producer import emit_ts_event

logger = logging.getLogger(__name__)

_ACHIEVEMENT_TYPE_MAP = {
    "7-day streak": "7-day-streak",
    "30-day streak": "30-day-streak",
    "100-day streak": "100-day-streak",
    "first-lesson": "first-lesson",
    # "level-up" is the third AchievementType in the TS shared package but has no producer here:
    # it represents a CEFR level advancement (A1→A2, etc.) and belongs in AGT-05 (assessment)
    # once IRT theta thresholds are defined. Tracked in: TODO implement level-up in AGT-05.
}


async def send_milestone(clerk_user_id: str, milestone_name: str) -> None:
    """
    Emit achievement.unlocked Kafka event if the milestone maps to a known AchievementType.
    Unrecognised milestone names are silently skipped — add them to _ACHIEVEMENT_TYPE_MAP
    and the TS AchievementType union when a new milestone type is introduced.
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


def _streak_key(clerk_user_id: str) -> str:
    return f"streak:{clerk_user_id}"


async def get_streak(clerk_user_id: str) -> int:
    """Return the current persisted streak for a user (0 if never set)."""
    r = await get_redis()
    val = await r.get(_streak_key(clerk_user_id))
    return int(val) if val else 0


async def record_session_complete(
    clerk_user_id: str,
    current_streak: int,
    session_duration_minutes: float,
) -> dict:
    """
    Process a completed session for streak and goal tracking.
    Reads from Redis to get authoritative streak, increments, persists back.
    The `current_streak` parameter is used as a fallback when Redis has no record.
    """
    r = await get_redis()
    key = _streak_key(clerk_user_id)
    await r.setnx(key, current_streak)
    new_streak = await r.incr(key)

    if new_streak in (7, 30, 100):
        await send_milestone(clerk_user_id, f"{new_streak}-day streak")

    return {
        "streak": new_streak,
        "session_recorded": True,
    }

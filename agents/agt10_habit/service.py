"""
Habit Building Agent service.
Manages streak tracking and milestone notifications via Kafka.
Absence-based reminders (daily-reminder, etc.) are owned by
notification-service's dailyReminder.ts scheduler, which pulls context
from AGT-07 directly — this agent does not compute or trigger those.
"""

import logging
from datetime import date, datetime, timezone

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

# Mirrors agents/agt01_profiling/consumers.py's dedup TTL for the same session.end event.
_DEDUP_TTL_SECONDS = 172800  # 2 days


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


def _dedup_key(session_id: str) -> str:
    return f"agt10:processed:session_end:{session_id}"


def _today() -> date:
    """UTC calendar date — kept as its own function (not inlined) so tests
    can monkeypatch 'today' instead of freezing wall-clock time."""
    return datetime.now(timezone.utc).date()


async def get_streak(clerk_user_id: str) -> int:
    """Return the current persisted streak count for a user (0 if never set)."""
    r = await get_redis()
    val = await r.hget(_streak_key(clerk_user_id), "count")
    return int(val) if val else 0


async def record_session_complete(clerk_user_id: str, session_id: str) -> dict:
    """
    Process a qualifying completed session (AGT-03's end_session only emits
    session.end for sessions with at least one turn — see
    agents/agt03_tutor/service.py) and advance the user's day-based streak.

    Streak semantics, keyed on UTC calendar day:
      - No prior record, or the last active day was more than one day ago
        (the streak was broken) -> count resets to 1.
      - The last active day was exactly one day ago -> count increments by 1.
      - The last active day IS today -> no-op, count unchanged (a second
        qualifying session on the same day does not advance the streak).

    Idempotent per session_id via a Redis SET NX EX guard, since Kafka
    delivery is at-least-once — mirrors the same guard
    agents/agt01_profiling/consumers.py applies to this same session.end
    event.
    """
    r = await get_redis()

    was_new = await r.set(_dedup_key(session_id), b"1", nx=True, ex=_DEDUP_TTL_SECONDS)
    if not was_new:
        return {"streak": await get_streak(clerk_user_id), "session_recorded": False}

    key = _streak_key(clerk_user_id)
    today = _today()
    stored = await r.hgetall(key)
    count = int(stored[b"count"]) if stored.get(b"count") else 0
    raw_last_active = stored.get(b"last_active_date")
    last_active = date.fromisoformat(raw_last_active.decode()) if raw_last_active else None

    if last_active == today:
        new_streak = count
    elif last_active is not None and (today - last_active).days == 1:
        new_streak = count + 1
    else:
        new_streak = 1

    await r.hset(key, mapping={"count": new_streak, "last_active_date": today.isoformat()})

    if new_streak in (7, 30, 100) and new_streak != count:
        await send_milestone(clerk_user_id, f"{new_streak}-day streak")

    return {"streak": new_streak, "session_recorded": True}

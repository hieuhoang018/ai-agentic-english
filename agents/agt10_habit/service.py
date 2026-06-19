"""
Habit Building Agent service.
Manages streak tracking, re-engagement escalation, and notification scheduling.
"""

import logging
from agents.agt10_habit.novu import trigger, sync_subscriber

logger = logging.getLogger(__name__)


async def check_re_engagement(
    clerk_user_id: str,
    days_since_last_session: int,
    risk_score: float = 0.0,
    streak_days: int = 0,
    review_due_count: int = 0,
) -> str | None:
    """
    Trigger the appropriate re-engagement Novu template based on absence duration.
    Returns the template ID triggered, or None if no action taken.

    Escalation protocol:
      1 day  → daily reminder
      3 days → re-engagement nudge
      7 days → weekly progress summary (email)
      risk > 0.7 → proactive intervention
    """
    payload_base = {
        "streakDays": streak_days,
        "reviewsDue": review_due_count,
        "daysSince": days_since_last_session,
    }

    if days_since_last_session >= 7:
        template = "weekly-progress-summary"
    elif days_since_last_session >= 3:
        template = "re-engagement-nudge"
    elif days_since_last_session >= 1:
        template = "daily-reminder"
    elif risk_score > 0.7:
        template = "proactive-intervention"
    else:
        return None

    await trigger(template, clerk_user_id, payload_base)
    return template


async def send_milestone(clerk_user_id: str, milestone_name: str) -> None:
    """Trigger a milestone celebration notification."""
    await trigger("milestone-celebration", clerk_user_id, {"milestoneName": milestone_name})


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

    # Check streak milestones
    if new_streak in (7, 30, 100):
        await send_milestone(clerk_user_id, f"{new_streak}-day streak")

    return {
        "streak": new_streak,
        "session_recorded": True,
    }

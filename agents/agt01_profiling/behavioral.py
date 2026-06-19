"""
Exponentially Weighted Moving Average (EWMA) for behavioral profiling.

Tracks session patterns: session length, time-of-day engagement, completion rates.
Alpha = 0.3 weights recent behaviour more heavily while retaining history.
"""

EWMA_ALPHA = 0.3


def update_ewma(current: float | None, new_value: float) -> float:
    """
    Update EWMA. If no history (current is None), seed with new_value.
    Formula: ewma_new = alpha * new_value + (1 - alpha) * ewma_old
    """
    if current is None:
        return round(new_value, 4)
    return round(EWMA_ALPHA * new_value + (1 - EWMA_ALPHA) * current, 4)


def update_behavioral_profile(profile: dict, session_length_minutes: float) -> dict:
    """
    Update all EWMA fields in the behavioral profile dict.
    Called at session end with the completed session's metrics.
    Returns updated profile dict.
    """
    updated = dict(profile)
    updated["avg_session_length"] = update_ewma(
        profile.get("avg_session_length"), session_length_minutes
    )
    return updated

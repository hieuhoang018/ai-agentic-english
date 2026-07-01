"""
Behavioural risk scoring for disengagement prediction.

Transparent multi-signal weighted score — NOT a trained ML model. A trained
sklearn.LogisticRegression model (as originally envisioned) requires labeled
churn outcomes to fit against; no such dataset exists in this system yet.
Fabricating training labels would be worse than keeping this honest and
explicit. Revisit once real churn-labeled data exists.

Signals (each computed from learning_sessions rows AGT-08 already fetches —
no new table or data source required):
  - days_since_last_session: raw count (unchanged from the original stub)
  - session_gap_trend: are inter-session gaps widening (declining frequency)?
  - session_length_trend: are sessions getting shorter (declining engagement)?

Each signal contributes additively to a [0, 1]-bounded score via fixed
weights below. Threshold for AGT-10 behavioral_risk_event alert remains 0.7,
unchanged from the original spec.
"""

from datetime import datetime, timezone

# Weights sum to 1.0, so with all three components maxed at 1.0 the raw score
# is exactly 1.0 (no reliance on the final clamp to stay in-range).
#
# _DAYS_ABSENT_WEIGHT is raised from an initial 0.5 to 0.7 so that a 14+ day
# absence *alone* (with zero trend signal — e.g. a brand-new user with no
# session history to compute a trend from) still crosses the 0.7 alert
# threshold, matching the original stub's behavior at that boundary. The
# remaining 0.3 is split 0.2/0.1 between gap-trend and length-trend so a
# recently-active-but-declining user (gaps widening) can still be
# meaningfully distinguished from a steady, frequent user even when both
# have days_since_last_session=1 — see
# test_compute_risk_score_elevated_for_widening_gaps_even_if_recent.
_DAYS_ABSENT_WEIGHT = 0.7
_GAP_TREND_WEIGHT = 0.2
_LENGTH_TREND_WEIGHT = 0.1

_MIN_SESSIONS_FOR_TREND = 4


def _parse_time(iso_str: str) -> datetime:
    return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))


def _session_gap_trend(sessions: list[dict]) -> float:
    """
    Compares the average gap between consecutive sessions in the most recent
    half of the list vs. the older half. Positive = gaps widening (frequency
    declining, worse). Sessions list is assumed ordered most-recent-first
    (matching AGT-06's /ltm/{user}/sessions contract — see
    agents/agt06_memory/ltm.py get_sessions(), `ORDER BY start_time DESC`),
    but this function re-sorts ascending internally so it works regardless
    of the caller's ordering. Returns 0.0 if there aren't enough sessions to
    compare two halves meaningfully.
    """
    if len(sessions) < _MIN_SESSIONS_FOR_TREND:
        return 0.0

    times = sorted((_parse_time(s["start_time"]) for s in sessions if s.get("start_time")))
    if len(times) < _MIN_SESSIONS_FOR_TREND:
        return 0.0

    gaps_days = [(times[i + 1] - times[i]).total_seconds() / 86400 for i in range(len(times) - 1)]
    midpoint = len(gaps_days) // 2
    older_avg = sum(gaps_days[:midpoint]) / midpoint
    recent_avg = sum(gaps_days[midpoint:]) / (len(gaps_days) - midpoint)

    # Normalise to a roughly [-1, 1]-ish range via a simple ratio-based delta,
    # clamped, rather than an unbounded raw day difference.
    if older_avg == 0:
        return 1.0 if recent_avg > 0 else 0.0
    raw = (recent_avg - older_avg) / max(older_avg, 1.0)
    return max(-1.0, min(1.0, raw))


def _session_length_trend(sessions: list[dict]) -> float:
    """
    Same recent-half-vs-older-half comparison, but on session length
    (end_time - start_time) instead of inter-session gap. Sessions with no
    end_time (still in progress, or never properly closed) are skipped.
    Positive = sessions shrinking (declining engagement, worse).
    """
    timed = []
    for s in sessions:
        if not s.get("start_time") or not s.get("end_time"):
            continue
        length_min = (_parse_time(s["end_time"]) - _parse_time(s["start_time"])).total_seconds() / 60.0
        timed.append((_parse_time(s["start_time"]), length_min))

    if len(timed) < _MIN_SESSIONS_FOR_TREND:
        return 0.0

    timed.sort(key=lambda t: t[0])
    lengths = [length for _, length in timed]
    midpoint = len(lengths) // 2
    older_avg = sum(lengths[:midpoint]) / midpoint
    recent_avg = sum(lengths[midpoint:]) / (len(lengths) - midpoint)

    if older_avg == 0:
        return 0.0
    raw = (older_avg - recent_avg) / max(older_avg, 1.0)  # shrinking -> positive
    return max(-1.0, min(1.0, raw))


def compute_risk_score(
    behavioral_profile: dict,
    days_since_last_session: int,
    sessions: list[dict] | None = None,
) -> float:
    """
    Transparent multi-signal weighted risk score in [0.0, 1.0].
    `sessions` is the same list AGT-08's service.py already fetches from
    AGT-06's /ltm/{user}/sessions endpoint — pass it through directly.
    """
    sessions = sessions or []

    days_component = min(1.0, days_since_last_session / 14.0)  # saturates at 14+ days absent
    gap_component = max(0.0, _session_gap_trend(sessions))      # only the "worse" direction counts
    length_component = max(0.0, _session_length_trend(sessions))

    score = (
        _DAYS_ABSENT_WEIGHT * days_component
        + _GAP_TREND_WEIGHT * gap_component
        + _LENGTH_TREND_WEIGHT * length_component
    )
    return max(0.0, min(1.0, score))

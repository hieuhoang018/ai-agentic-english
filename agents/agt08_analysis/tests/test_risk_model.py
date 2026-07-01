"""
Tests for AGT-08 risk_model: a transparent multi-signal weighted risk score,
NOT a trained ML model (see plan rationale — no labeled churn data exists).
"""

from datetime import datetime, timedelta, timezone
from agents.agt08_analysis.risk_model import compute_risk_score, _session_gap_trend, _session_length_trend


def _session(days_ago: float, length_minutes: float | None = None) -> dict:
    start = datetime.now(timezone.utc) - timedelta(days=days_ago)
    s = {"start_time": start.isoformat()}
    if length_minutes is not None:
        end = start + timedelta(minutes=length_minutes)
        s["end_time"] = end.isoformat()
    return s


# ── _session_gap_trend ────────────────────────────────────────────────────────

def test_session_gap_trend_zero_with_fewer_than_4_sessions():
    """Need enough sessions to compare 'recent half' vs 'older half' gaps."""
    sessions = [_session(0), _session(2), _session(4)]
    assert _session_gap_trend(sessions) == 0.0


def test_session_gap_trend_positive_when_gaps_widening():
    """Sessions used to be daily, now they're every 5 days — gaps widening
    means engagement frequency is DECLINING, which the function reports as
    a positive (worse) trend value."""
    sessions = [
        _session(20), _session(19), _session(18),  # old: daily (gap=1)
        _session(10), _session(5), _session(0),     # recent: every 5 days (gap=5)
    ]
    trend = _session_gap_trend(sessions)
    assert trend > 0


def test_session_gap_trend_negative_or_zero_when_gaps_narrowing():
    """Engagement frequency IMPROVING (gaps shrinking) must not count as risk."""
    sessions = [
        _session(20), _session(15), _session(10),  # old: every 5 days
        _session(2), _session(1), _session(0),      # recent: daily
    ]
    trend = _session_gap_trend(sessions)
    assert trend <= 0


# ── _session_length_trend ─────────────────────────────────────────────────────

def test_session_length_trend_zero_with_fewer_than_4_sessions_with_lengths():
    sessions = [_session(0, 10), _session(1, 10)]
    assert _session_length_trend(sessions) == 0.0


def test_session_length_trend_positive_when_lengths_shrinking():
    """Sessions getting shorter over time = declining engagement = positive (worse) trend."""
    sessions = [
        _session(10, 30), _session(8, 28), _session(6, 32),  # old: ~30 min
        _session(4, 10), _session(2, 8), _session(0, 9),       # recent: ~9 min
    ]
    trend = _session_length_trend(sessions)
    assert trend > 0


def test_session_length_trend_ignores_sessions_without_end_time():
    """A session still in progress (no end_time) must not crash the calculation."""
    sessions = [
        _session(10, 30), _session(8, 28), _session(6, 32),
        _session(4, 20), _session(2, 18), {"start_time": datetime.now(timezone.utc).isoformat()},
    ]
    # Must not raise
    _session_length_trend(sessions)


# ── compute_risk_score ────────────────────────────────────────────────────────

def test_compute_risk_score_zero_for_active_recent_user():
    sessions = [_session(0, 20), _session(1, 18), _session(2, 22), _session(3, 19)]
    score = compute_risk_score(behavioral_profile={}, days_since_last_session=0, sessions=sessions)
    assert score < 0.3


def test_compute_risk_score_high_for_long_absence():
    score = compute_risk_score(behavioral_profile={}, days_since_last_session=14, sessions=[])
    assert score >= 0.7


def test_compute_risk_score_elevated_for_widening_gaps_even_if_recent():
    """A user who was just active yesterday but whose engagement has been
    steadily declining (gaps widening over the last several sessions) should
    score higher than a steady, frequent user — the day-count-only stub could
    never express this, since days_since_last_session=1 alone looks fine."""
    declining_sessions = [
        _session(20), _session(19), _session(18),
        _session(10), _session(5), _session(1),
    ]
    steady_sessions = [_session(4), _session(3), _session(2), _session(1)]

    declining_score = compute_risk_score({}, days_since_last_session=1, sessions=declining_sessions)
    steady_score = compute_risk_score({}, days_since_last_session=1, sessions=steady_sessions)

    assert declining_score > steady_score


def test_compute_risk_score_bounded_between_0_and_1():
    score = compute_risk_score({}, days_since_last_session=999, sessions=[])
    assert 0.0 <= score <= 1.0


def test_compute_risk_score_handles_empty_sessions_list():
    # Must not crash with zero session history at all.
    score = compute_risk_score({}, days_since_last_session=0, sessions=[])
    assert 0.0 <= score <= 1.0

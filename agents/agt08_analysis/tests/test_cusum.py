"""
Tests for AGT-08 real CUSUM persistent error detection.
"""

from datetime import datetime, timedelta, timezone
from agents.agt08_analysis.cusum import detect_persistent_errors, _compute_cusum_series


def _make_error(session_id: str, error_type: str, skill: str, days_ago: int) -> dict:
    created = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    return {
        "session_id": session_id, "error_type": error_type, "skill_domain": skill,
        "severity": 2, "created_at": created,
    }


def test_compute_cusum_series_zero_when_rate_at_baseline():
    """A constant rate (1 error/session every session) with k=0 slack should
    keep the CUSUM statistic at exactly 0 (no upward drift)."""
    rates = [1.0, 1.0, 1.0, 1.0, 1.0]
    series = _compute_cusum_series(rates, mu_0=1.0, k=0.0)
    assert series[-1] == 0.0


def test_compute_cusum_series_grows_when_rate_above_baseline():
    rates = [1.0, 2.0, 2.0, 2.0, 2.0]  # baseline 1.0, then sustained jump to 2.0
    series = _compute_cusum_series(rates, mu_0=1.0, k=0.25)
    assert series[-1] > series[0]
    assert all(s >= 0.0 for s in series), "CUSUM statistic must never go negative"


def test_compute_cusum_series_resets_after_drop_below_baseline():
    rates = [3.0, 3.0, 0.0, 0.0]  # spike then drop
    series = _compute_cusum_series(rates, mu_0=1.0, k=0.25)
    assert series[-1] < series[1], "CUSUM must decay back toward 0 once rate drops"


def test_suppresses_all_when_fewer_than_min_sessions():
    errors = [_make_error(f"sess-{i}", "grammar", "SPEAKING", days_ago=i) for i in range(3)]
    result = detect_persistent_errors(errors, min_sessions=5)
    assert result == []


def test_suppresses_all_when_zero_errors():
    assert detect_persistent_errors([], min_sessions=5) == []


def test_detects_sustained_high_rate_error_type():
    """An error_type appearing in every one of 6 sessions (rate=1.0 throughout,
    consistently present) must be flagged once enough sessions exist."""
    errors = [_make_error(f"sess-{i}", "verb_tense", "SPEAKING", days_ago=6 - i) for i in range(6)]
    result = detect_persistent_errors(errors, min_sessions=5)
    types_found = {r["error_type"] for r in result}
    assert "verb_tense" in types_found


def test_does_not_flag_a_single_isolated_occurrence():
    """One occurrence of a rare error type among many sessions of other error
    types must not trigger a persistent-weakness alert."""
    errors = (
        [_make_error(f"sess-{i}", "verb_tense", "SPEAKING", days_ago=6 - i) for i in range(6)]
        + [_make_error("sess-0", "rare_typo", "WRITING", days_ago=6)]
    )
    result = detect_persistent_errors(errors, min_sessions=5)
    types_found = {r["error_type"] for r in result}
    assert "rare_typo" not in types_found


def test_result_includes_skill_domain_and_cusum_statistic():
    errors = [_make_error(f"sess-{i}", "grammar", "WRITING", days_ago=6 - i) for i in range(6)]
    result = detect_persistent_errors(errors, min_sessions=5)
    assert len(result) == 1
    assert result[0]["skill_domain"] == "WRITING"
    assert "cusum_statistic" in result[0]
    assert result[0]["cusum_statistic"] > 0


def test_multiple_persistent_types_independent_skill_domains():
    errors = (
        [_make_error(f"sg-{i}", "grammar", "SPEAKING", days_ago=6 - i) for i in range(6)]
        + [_make_error(f"wp-{i}", "punctuation", "WRITING", days_ago=6 - i) for i in range(6)]
    )
    result = detect_persistent_errors(errors, min_sessions=5)
    types_found = {(r["error_type"], r["skill_domain"]) for r in result}
    assert ("grammar", "SPEAKING") in types_found
    assert ("punctuation", "WRITING") in types_found


def test_duplicate_errors_within_one_session_count_once_not_twice():
    """Occurrence/rate is presence-based per session, not count-based. Two
    error events of the same (error_type, skill_domain) landing in the same
    session must produce an identical result to a single occurrence in that
    session -- the rate series is boolean-collapsed (1.0 if present, else
    0.0), so duplicates within a session must not inflate the rate to 2.0
    or otherwise change the CUSUM outcome."""
    errors_single = [
        _make_error(f"sess-{i}", "verb_tense", "SPEAKING", days_ago=6 - i) for i in range(6)
    ]
    result_single = detect_persistent_errors(errors_single, min_sessions=5)

    errors_duplicated = errors_single + [
        _make_error("sess-0", "verb_tense", "SPEAKING", days_ago=6)
    ]
    result_duplicated = detect_persistent_errors(errors_duplicated, min_sessions=5)

    assert len(result_single) == 1
    assert len(result_duplicated) == 1
    assert result_single[0]["count"] == result_duplicated[0]["count"]
    assert result_single[0]["cusum_statistic"] == result_duplicated[0]["cusum_statistic"]


def test_exact_min_sessions_boundary_is_not_suppressed():
    """The suppression check is `if len(sessions_seen) < min_sessions: return
    []`, so exactly len(sessions_seen) == min_sessions must NOT be
    suppressed (5 < 5 is False). With exactly 5 distinct sessions and
    min_sessions=5, an error type present in all 5 (>= 3 occurrences) must
    still produce a non-empty, alerting result."""
    errors = [_make_error(f"sess-{i}", "grammar", "WRITING", days_ago=5 - i) for i in range(5)]
    result = detect_persistent_errors(errors, min_sessions=5)
    types_found = {r["error_type"] for r in result}
    assert result != []
    assert "grammar" in types_found

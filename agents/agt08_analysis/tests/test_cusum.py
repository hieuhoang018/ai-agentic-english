"""
Tests for AGT-08 CUSUM persistent error detection.
"""

from agents.agt08_analysis.cusum import detect_persistent_errors


def _make_errors(error_types: list[str], skill: str = "SPEAKING") -> list[dict]:
    return [{"error_type": et, "skill_domain": skill} for et in error_types]


def test_suppresses_all_when_fewer_than_min_sessions():
    errors = _make_errors(["grammar"] * 10)
    # Only 10 records but min_sessions=5 is the default — wait, 10 >= 5, so this
    # actually should NOT suppress. Let me set min_sessions=20.
    result = detect_persistent_errors(errors, min_sessions=20)
    assert result == []


def test_suppresses_all_when_zero_errors():
    result = detect_persistent_errors([], min_sessions=5)
    assert result == []


def test_detects_error_type_seen_three_or_more_times():
    errors = _make_errors(["grammar", "grammar", "grammar", "vocabulary", "vocabulary"])
    result = detect_persistent_errors(errors, min_sessions=5)
    types_found = {r["error_type"] for r in result}
    assert "grammar" in types_found
    assert "vocabulary" not in types_found  # only 2 occurrences


def test_does_not_flag_type_seen_fewer_than_three_times():
    errors = _make_errors(["fluency", "fluency", "grammar", "grammar", "grammar"])
    result = detect_persistent_errors(errors, min_sessions=5)
    types_found = {r["error_type"] for r in result}
    assert "fluency" not in types_found
    assert "grammar" in types_found


def test_result_includes_count_and_skill_domain():
    errors = _make_errors(["grammar"] * 4, skill="WRITING")
    result = detect_persistent_errors(errors, min_sessions=4)
    assert len(result) == 1
    assert result[0]["count"] == 4
    assert result[0]["skill_domain"] == "WRITING"


def test_multiple_persistent_types_all_returned():
    errors = _make_errors(["grammar"] * 3 + ["vocabulary"] * 3 + ["fluency"] * 3)
    result = detect_persistent_errors(errors, min_sessions=5)
    types_found = {r["error_type"] for r in result}
    assert types_found == {"grammar", "vocabulary", "fluency"}

"""
Unit tests for agt09 recommendation scorer.

score_items(candidates, profile, recently_seen_ids) contract:
  - Filters items whose id is in recently_seen_ids
  - Returns at most 3 items
  - Items sorted by score descending
  - Each result has 'rationale' field
  - Score formula: 1.0 - |difficulty - normalised_theta|
    where normalised_theta = (theta + 2.0) / 4.0  (maps [-2,2] → [0,1])
"""

import pytest
from agents.agt09_recommendation.scorer import score_items


def _make_item(id: str, skill: str = "READING", difficulty: float = 0.5) -> dict:
    return {"id": id, "title": f"Item {id}", "skillDomain": skill,
            "difficulty": difficulty, "cefrLevel": "B1"}


def _make_profile(theta_r: float = 0.0, cold_start: bool = False) -> dict:
    return {
        "irt_theta": {"L": 0.0, "S": None, "R": theta_r, "W": 0.0},
        "cold_start_flag": cold_start,
    }


# ── filtering ────────────────────────────────────────────────────────────────

def test_empty_candidates_returns_empty_list():
    assert score_items([], _make_profile(), []) == []


def test_recently_seen_items_are_filtered_out():
    items = [_make_item("a"), _make_item("b"), _make_item("c")]
    result = score_items(items, _make_profile(), recently_seen_ids=["a", "b"])
    ids = [r["id"] for r in result]
    assert "a" not in ids
    assert "b" not in ids
    assert "c" in ids


def test_all_candidates_seen_returns_empty_list():
    items = [_make_item("a"), _make_item("b")]
    result = score_items(items, _make_profile(), recently_seen_ids=["a", "b"])
    assert result == []


def test_empty_recently_seen_passes_all_through_filter():
    items = [_make_item(str(i)) for i in range(5)]
    result = score_items(items, _make_profile(), recently_seen_ids=[])
    assert len(result) == 3  # capped at 3


# ── output shape ─────────────────────────────────────────────────────────────

def test_returns_at_most_3_items():
    items = [_make_item(str(i), difficulty=i * 0.1) for i in range(10)]
    result = score_items(items, _make_profile(), [])
    assert len(result) <= 3


def test_each_result_has_rationale_field():
    items = [_make_item("a"), _make_item("b"), _make_item("c")]
    result = score_items(items, _make_profile(), [])
    for item in result:
        assert "rationale" in item
        assert isinstance(item["rationale"], str)
        assert len(item["rationale"]) > 0


def test_each_result_has_score_field():
    items = [_make_item("a"), _make_item("b"), _make_item("c")]
    result = score_items(items, _make_profile(), [])
    for item in result:
        assert "_score" in item
        assert 0.0 <= item["_score"] <= 1.0


def test_original_fields_are_preserved():
    items = [_make_item("a", skill="WRITING", difficulty=0.3)]
    result = score_items(items, _make_profile(), [])
    assert len(result) == 1
    assert result[0]["id"] == "a"
    assert result[0]["skillDomain"] == "WRITING"
    assert result[0]["difficulty"] == 0.3


# ── scoring correctness ───────────────────────────────────────────────────────

def test_items_sorted_by_score_descending():
    # theta_r=0.0 → normalised=0.5
    # Item with diff=0.5 → score=1.0 (perfect)
    # Item with diff=0.0 → score=0.5
    # Item with diff=1.0 → score=0.5
    items = [
        _make_item("far", difficulty=0.0),
        _make_item("perfect", difficulty=0.5),
        _make_item("far2", difficulty=1.0),
    ]
    result = score_items(items, _make_profile(theta_r=0.0), [])
    scores = [r["_score"] for r in result]
    assert scores == sorted(scores, reverse=True)


def test_perfect_difficulty_match_scores_1_0():
    # theta=0.0 → normalised=0.5; diff=0.5 → score=1.0 - |0.5-0.5|=1.0
    items = [_make_item("x", difficulty=0.5)]
    result = score_items(items, _make_profile(theta_r=0.0), [])
    assert result[0]["_score"] == pytest.approx(1.0, abs=0.001)


def test_maximum_difficulty_mismatch_scores_0_5():
    # theta=0.0 → normalised=0.5; diff=0.0 → score=1.0 - |0.0-0.5|=0.5
    items = [_make_item("x", difficulty=0.0)]
    result = score_items(items, _make_profile(theta_r=0.0), [])
    assert result[0]["_score"] == pytest.approx(0.5, abs=0.001)


def test_theta_r_affects_reading_score_but_not_writing():
    # theta_r=2.0 → normalised_R=1.0
    # READING item with diff=1.0 → score=1.0 - |1.0-1.0|=1.0
    # WRITING item with diff=1.0 → uses theta_W=0.0 → normalised=0.5 → score=0.5
    items = [
        _make_item("reading-hard", skill="READING", difficulty=1.0),
        _make_item("writing-hard", skill="WRITING", difficulty=1.0),
    ]
    profile = {"irt_theta": {"L": 0.0, "S": None, "R": 2.0, "W": 0.0}}
    result = score_items(items, profile, [])
    reading = next(r for r in result if r["id"] == "reading-hard")
    writing = next(r for r in result if r["id"] == "writing-hard")
    assert reading["_score"] > writing["_score"]


def test_missing_theta_defaults_to_zero():
    # Profile with no irt_theta key — should not crash
    items = [_make_item("a", difficulty=0.5)]
    result = score_items(items, {}, [])
    assert len(result) == 1
    assert result[0]["_score"] == pytest.approx(1.0, abs=0.001)


def test_explicit_none_theta_value_defaults_to_zero():
    # irt_theta can hold an explicit None for a skill not yet assessed
    # (e.g. {"S": None} before any speaking assessment) — must not crash.
    items = [_make_item("a", skill="SPEAKING", difficulty=0.5)]
    profile = {"irt_theta": {"L": 0.0, "S": None, "R": 0.0, "W": 0.0}}
    result = score_items(items, profile, [])
    assert len(result) == 1
    assert result[0]["_score"] == pytest.approx(1.0, abs=0.001)


def test_single_candidate_always_returned():
    items = [_make_item("only")]
    result = score_items(items, _make_profile(), [])
    assert len(result) == 1
    assert result[0]["id"] == "only"


# ── skill diversity enforcement ───────────────────────────────────────────────

def test_top3_includes_at_least_one_item_per_skill_domain_when_available():
    # 3 READING items would win on pure score, but WRITING and LISTENING
    # candidates exist and must each get at least one of the 3 slots.
    items = [
        _make_item("read-1", skill="READING", difficulty=0.5),  # score 1.0
        _make_item("read-2", skill="READING", difficulty=0.6),  # score 0.9
        _make_item("read-3", skill="READING", difficulty=0.7),  # score 0.8
        _make_item("write-1", skill="WRITING", difficulty=0.9),  # score 0.6
        _make_item("listen-1", skill="LISTENING", difficulty=1.0),  # score 0.5
    ]
    result = score_items(items, _make_profile(), [])
    domains = {r["skillDomain"] for r in result}
    assert domains == {"READING", "WRITING", "LISTENING"}
    assert len(result) == 3


def test_diversity_pick_per_domain_is_highest_scoring_in_that_domain():
    items = [
        _make_item("read-1", skill="READING", difficulty=0.5),  # score 1.0 (best overall)
        _make_item("read-2", skill="READING", difficulty=0.6),  # score 0.9
        _make_item("write-1", skill="WRITING", difficulty=0.9),  # score 0.6
        _make_item("listen-1", skill="LISTENING", difficulty=1.0),  # score 0.5
    ]
    result = score_items(items, _make_profile(), [])
    ids = {r["id"] for r in result}
    assert ids == {"read-1", "write-1", "listen-1"}
    assert "read-2" not in ids


def test_diversity_result_still_sorted_by_score_descending():
    items = [
        _make_item("read-1", skill="READING", difficulty=0.5),
        _make_item("read-2", skill="READING", difficulty=0.6),
        _make_item("write-1", skill="WRITING", difficulty=0.9),
        _make_item("listen-1", skill="LISTENING", difficulty=1.0),
    ]
    result = score_items(items, _make_profile(), [])
    scores = [r["_score"] for r in result]
    assert scores == sorted(scores, reverse=True)


def test_single_domain_candidates_fill_remaining_slots_by_score():
    # Only one skill domain present — diversity has nothing to diversify,
    # top 3 by score should be returned same as before.
    items = [_make_item(str(i), difficulty=i * 0.1) for i in range(10)]
    result = score_items(items, _make_profile(), [])
    assert len(result) == 3
    scores = [r["_score"] for r in result]
    assert scores == sorted(scores, reverse=True)

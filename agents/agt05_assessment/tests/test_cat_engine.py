import math
import pytest
from agents.agt05_assessment.cat_engine import (
    estimate_theta_eap,
    select_next_item_stub,
    should_terminate,
)


# ── estimate_theta_eap ────────────────────────────────────────────────────────

def _resp(item_id: str, difficulty: float, correct: bool) -> dict:
    return {"item_id": item_id, "difficulty_param": difficulty, "correct": correct}


def test_estimate_theta_eap_no_responses_returns_prior_mean():
    """With zero responses, EAP must collapse to the prior mean (0.0 for N(0,1))."""
    assert estimate_theta_eap([]) == 0.0


def test_estimate_theta_eap_all_correct_on_easy_items_skews_positive():
    """Acing items well below the prior mean should pull theta clearly positive,
    since getting easy items right is weak evidence, but getting MANY right
    with no wrong answers should still move the estimate up from 0."""
    responses = [_resp(f"item-{i}", -1.0, True) for i in range(10)]
    theta = estimate_theta_eap(responses)
    assert theta > 0.3


def test_estimate_theta_eap_all_wrong_on_hard_items_skews_negative():
    responses = [_resp(f"item-{i}", 1.0, False) for i in range(10)]
    theta = estimate_theta_eap(responses)
    assert theta < -0.3


def test_estimate_theta_eap_mixed_at_zero_difficulty_near_zero():
    """5 correct, 5 wrong, all items at b=0.0 (matches the prior mean) should
    land close to theta=0."""
    responses = (
        [_resp(f"item-c{i}", 0.0, True) for i in range(5)]
        + [_resp(f"item-w{i}", 0.0, False) for i in range(5)]
    )
    theta = estimate_theta_eap(responses)
    assert abs(theta) < 0.3


def test_estimate_theta_eap_is_bounded():
    """EAP over a finite quadrature grid must stay within the grid's range
    (a real implementation bug would let it diverge to +/- infinity)."""
    responses = [_resp(f"item-{i}", -2.0, True) for i in range(30)]
    theta = estimate_theta_eap(responses)
    assert -4.0 <= theta <= 4.0


def test_estimate_theta_eap_more_correct_responses_increase_theta_monotonically():
    """Adding another correct response (on a fixed-difficulty item) must never
    decrease the running theta estimate."""
    responses = []
    thetas = []
    for i in range(8):
        responses.append(_resp(f"item-{i}", 0.0, True))
        thetas.append(estimate_theta_eap(responses))
    for earlier, later in zip(thetas, thetas[1:]):
        assert later >= earlier - 1e-9, f"theta decreased: {thetas}"


# ── should_terminate ──────────────────────────────────────────────────────────

def test_should_terminate_empty_responses():
    assert should_terminate([]) is False


def test_should_terminate_below_max():
    responses = [{"item_id": f"item-{i}", "correct": True} for i in range(29)]
    assert should_terminate(responses) is False


def test_should_terminate_at_max():
    responses = [{"item_id": f"item-{i}", "correct": True} for i in range(30)]
    assert should_terminate(responses) is True


def test_should_terminate_above_max():
    responses = [{"item_id": f"item-{i}", "correct": True} for i in range(35)]
    assert should_terminate(responses) is True


def test_should_terminate_one_below_max():
    responses = [{"item_id": f"item-{i}", "correct": True} for i in range(29)]
    assert should_terminate(responses) is False


# ── select_next_item_stub ─────────────────────────────────────────────────────

def test_select_next_item_stub_empty_bank_returns_none():
    assert select_next_item_stub(0.0, [], []) is None


def test_select_next_item_stub_all_answered_returns_none():
    item_bank = [{"item_id": "item-1", "difficulty_param": 0.0}]
    assert select_next_item_stub(0.0, ["item-1"], item_bank) is None


def test_select_next_item_stub_picks_closest_difficulty_to_theta():
    item_bank = [
        {"item_id": "easy",   "difficulty_param": -1.0},
        {"item_id": "medium", "difficulty_param":  0.1},
        {"item_id": "hard",   "difficulty_param":  1.5},
    ]
    result = select_next_item_stub(0.0, [], item_bank)
    # |0.1 - 0.0| = 0.1 is smallest
    assert result["item_id"] == "medium"


def test_select_next_item_stub_skips_already_answered():
    item_bank = [
        {"item_id": "easy",   "difficulty_param": -1.0},
        {"item_id": "medium", "difficulty_param":  0.1},
        {"item_id": "hard",   "difficulty_param":  1.5},
    ]
    result = select_next_item_stub(0.0, ["medium"], item_bank)
    # medium answered → next closest to 0.0 is easy (|-1.0| = 1.0) vs hard (|1.5| = 1.5)
    assert result["item_id"] == "easy"


def test_select_next_item_stub_returns_full_item_dict():
    item_bank = [{"item_id": "item-1", "difficulty_param": 0.5, "extra_field": "value"}]
    result = select_next_item_stub(0.0, [], item_bank)
    assert result is not None
    assert result["item_id"] == "item-1"
    assert result["extra_field"] == "value"

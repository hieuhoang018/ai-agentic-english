import math
import pytest
from agents.agt05_assessment.cat_engine import (
    estimate_theta_eap,
    select_next_item_eap,
    should_terminate_eap,
    _fisher_information,
    _standard_error,
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


def test_p_correct_does_not_overflow_on_extreme_inputs():
    """_p_correct must clamp its exponent so extreme theta/difficulty values
    don't raise OverflowError from math.exp; result should be ~0.0 here since
    theta is far below difficulty."""
    from agents.agt05_assessment.cat_engine import _p_correct
    result = _p_correct(-1000.0, 1000.0)
    assert result == pytest.approx(0.0, abs=1e-9)


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


# ── _fisher_information / select_next_item_eap ────────────────────────────────

def test_fisher_information_is_maximised_at_theta_equals_difficulty():
    """Information I(theta) = P(1-P) peaks at exactly 0.25 when theta == difficulty
    (since P=0.5 there, and P(1-P) is maximised at P=0.5)."""
    info_at_peak = _fisher_information(0.5, 0.5)
    info_away = _fisher_information(0.5, 2.0)
    assert info_at_peak == pytest.approx(0.25)
    assert info_at_peak > info_away


def test_select_next_item_eap_picks_item_closest_to_theta_when_well_separated():
    item_bank = [
        {"item_id": "easy", "difficulty_param": -2.0},
        {"item_id": "medium", "difficulty_param": 0.1},
        {"item_id": "hard", "difficulty_param": 2.0},
    ]
    result = select_next_item_eap(theta=0.0, answered_ids=[], item_bank=item_bank)
    assert result["item_id"] == "medium"


def test_select_next_item_eap_skips_already_answered():
    item_bank = [
        {"item_id": "easy", "difficulty_param": -1.0},
        {"item_id": "medium", "difficulty_param": 0.1},
        {"item_id": "hard", "difficulty_param": 1.5},
    ]
    result = select_next_item_eap(theta=0.0, answered_ids=["medium"], item_bank=item_bank)
    assert result["item_id"] == "easy"  # |-1.0| info > |1.5| info at theta=0


def test_select_next_item_eap_empty_bank_returns_none():
    assert select_next_item_eap(theta=0.0, answered_ids=[], item_bank=[]) is None


def test_select_next_item_eap_all_answered_returns_none():
    item_bank = [{"item_id": "item-1", "difficulty_param": 0.0}]
    assert select_next_item_eap(theta=0.0, answered_ids=["item-1"], item_bank=item_bank) is None


def test_select_next_item_eap_returns_full_item_dict():
    item_bank = [{"item_id": "item-1", "difficulty_param": 0.5, "extra_field": "value"}]
    result = select_next_item_eap(theta=0.0, answered_ids=[], item_bank=item_bank)
    assert result["extra_field"] == "value"


# ── _standard_error / should_terminate_eap ────────────────────────────────────

def test_standard_error_decreases_as_more_items_answered():
    """SE(theta) must shrink as more informative responses accumulate."""
    se_after_1 = _standard_error(theta=0.0, administered_difficulties=[0.0])
    se_after_5 = _standard_error(theta=0.0, administered_difficulties=[0.0] * 5)
    assert se_after_5 < se_after_1


def test_standard_error_undefined_with_zero_items_returns_large_value():
    """With no items administered, SE is undefined (division by zero info) —
    must return a large sentinel, not raise or return 0.0 (which would
    incorrectly signal high precision with zero data)."""
    se = _standard_error(theta=0.0, administered_difficulties=[])
    assert se > 10.0


def test_should_terminate_eap_false_when_se_above_threshold_and_bank_not_exhausted():
    responses = [{"item_id": "item-1", "difficulty_param": 0.0, "correct": True}]
    result = should_terminate_eap(responses, theta=0.0, item_bank_size=12)
    assert result is False


def test_should_terminate_eap_true_when_se_below_threshold():
    """After enough well-targeted responses, SE(theta) should drop below 0.3."""
    responses = [
        {"item_id": f"item-{i}", "difficulty_param": 0.0, "correct": i % 2 == 0}
        for i in range(12)
    ]
    result = should_terminate_eap(responses, theta=0.0, item_bank_size=12)
    assert result is True


def test_should_terminate_eap_true_when_bank_exhausted_even_if_se_above_threshold():
    """A 12-item bank with only 1 item answered so far but item_bank_size=1
    must terminate — there is nothing left to administer, regardless of SE."""
    responses = [{"item_id": "item-1", "difficulty_param": 0.0, "correct": True}]
    result = should_terminate_eap(responses, theta=0.0, item_bank_size=1)
    assert result is True


def test_should_terminate_eap_respects_max_items_cap_below_bank_size():
    """Even with a huge item bank, a max_items cap (default 30) must still apply."""
    responses = [
        {"item_id": f"item-{i}", "difficulty_param": 5.0, "correct": False}  # poorly targeted -> high SE
        for i in range(30)
    ]
    result = should_terminate_eap(responses, theta=0.0, item_bank_size=1000, max_items=30)
    assert result is True

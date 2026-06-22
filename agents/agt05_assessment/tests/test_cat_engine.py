import pytest
from agents.agt05_assessment.cat_engine import (
    estimate_theta_stub,
    select_next_item_stub,
    should_terminate,
)


# ── estimate_theta_stub ───────────────────────────────────────────────────────

def test_estimate_theta_stub_no_responses_returns_zero():
    assert estimate_theta_stub([]) == 0.0


def test_estimate_theta_stub_all_correct_returns_max():
    responses = [{"item_id": f"item-{i}", "correct": True} for i in range(10)]
    assert estimate_theta_stub(responses) == 2.0


def test_estimate_theta_stub_all_wrong_returns_min():
    responses = [{"item_id": f"item-{i}", "correct": False} for i in range(10)]
    assert estimate_theta_stub(responses) == -2.0


def test_estimate_theta_stub_half_correct_returns_zero():
    responses = [{"item_id": f"item-{i}", "correct": i % 2 == 0} for i in range(10)]
    # 5 correct / 10 total → 0.5 * 4.0 - 2.0 = 0.0
    assert estimate_theta_stub(responses) == 0.0


def test_estimate_theta_stub_17_of_30():
    # Demo learner 1: Nguyen Van Minh — expected B1
    responses = [{"item_id": f"item-{i}", "correct": i <= 17} for i in range(1, 31)]
    result = estimate_theta_stub(responses)
    # 17/30 = 0.5667 → round(0.5667 * 4.0 - 2.0, 3) = 0.267
    assert result == pytest.approx(0.267, abs=0.001)


def test_estimate_theta_stub_10_of_30():
    # Demo learner 2: Nguyen Thi Van — expected A2
    responses = [{"item_id": f"item-{i}", "correct": i <= 10} for i in range(1, 31)]
    result = estimate_theta_stub(responses)
    # 10/30 = 0.3333 → round(0.3333 * 4.0 - 2.0, 3) = -0.667
    assert result == pytest.approx(-0.667, abs=0.001)


def test_estimate_theta_stub_23_of_30():
    # Demo learner 3: Tran Thu Huong — expected B2
    responses = [{"item_id": f"item-{i}", "correct": i <= 23} for i in range(1, 31)]
    result = estimate_theta_stub(responses)
    # 23/30 = 0.7667 → round(0.7667 * 4.0 - 2.0, 3) = 1.067
    assert result == pytest.approx(1.067, abs=0.001)


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

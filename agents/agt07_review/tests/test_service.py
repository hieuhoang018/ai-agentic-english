import math
import httpx
import pytest
import respx
from datetime import datetime, timezone
from agents.agt07_review import service
from agents.agt07_review.sm2 import (
    compute_retrievability,
    next_review_date_stub,
    update_stability_stub,
    STUB_INTERVALS,
)
from agents.shared.config import settings as _settings

AGT06_VOCAB_URL = f"{_settings.AGT06_BASE_URL}/ltm/user_test/vocabulary"
AGT06_ERRORS_URL = f"{_settings.AGT06_BASE_URL}/ltm/user_test/errors"

VOCAB_RESPONSE = [
    {
        "vocab_id": "v1",
        "word": "ephemeral",
        "encounter_count": 1,
        "context_sentences": ["Life is ephemeral."],
        "sm_stability": 1.0,
        "sm_retrievability": 0.5,
        "last_encounter": None,
    },
    {
        "vocab_id": "v2",
        "word": "ubiquitous",
        "encounter_count": 5,
        "context_sentences": [],
        "sm_stability": 10.0,
        "sm_retrievability": 0.99,
        "last_encounter": "2099-01-01T00:00:00+00:00",  # far future → not due
    },
]

ERRORS_RESPONSE = [
    {"error_type": "verb_tense", "skill_domain": "SPEAKING", "context_excerpt": "I go there yesterday"},
    {"error_type": "article", "skill_domain": "WRITING", "context_excerpt": "She is a honest person"},
]


# ---------------------------------------------------------------------------
# SM-2 math
# ---------------------------------------------------------------------------

class TestComputeRetrievability:
    def test_zero_days_since_review_returns_one(self):
        assert compute_retrievability(5.0, 0.0) == 1.0

    def test_zero_stability_returns_zero(self):
        assert compute_retrievability(0.0, 1.0) == 0.0

    def test_negative_stability_returns_zero(self):
        assert compute_retrievability(-1.0, 5.0) == 0.0

    def test_matches_forgetting_curve_formula(self):
        s, t = 3.0, 2.0
        expected = round(math.exp(-t / s), 4)
        assert compute_retrievability(s, t) == expected

    def test_higher_stability_gives_higher_retrievability(self):
        r_low = compute_retrievability(1.0, 2.0)
        r_high = compute_retrievability(5.0, 2.0)
        assert r_high > r_low

    def test_more_days_gives_lower_retrievability(self):
        r_recent = compute_retrievability(3.0, 1.0)
        r_old = compute_retrievability(3.0, 5.0)
        assert r_old < r_recent

    def test_negative_days_clamped_to_one(self):
        # Future last_encounter produces negative days_since → clamp to R=1.0 (no overflow)
        assert compute_retrievability(10.0, -26000.0) == 1.0

    def test_future_last_encounter_does_not_trigger_overflow(self):
        # Simulates the bug: last_encounter="2099-01-01" gives large negative days_since
        # Previously caused OverflowError: math range error
        result = compute_retrievability(10.0, -99999.0)
        assert result == 1.0


class TestNextReviewDateStub:
    @pytest.mark.parametrize("quality,expected_days", list(STUB_INTERVALS.items()))
    def test_interval_per_quality(self, quality: int, expected_days: int):
        before = datetime.now(timezone.utc)
        result = next_review_date_stub(quality, 1.0)
        delta = (result - before).total_seconds() / 86400
        assert abs(delta - expected_days) < 0.01, f"quality={quality}: expected {expected_days}d, got {delta:.2f}d"

    def test_unknown_quality_uses_default_3_days(self):
        before = datetime.now(timezone.utc)
        result = next_review_date_stub(99, 1.0)
        delta = (result - before).total_seconds() / 86400
        assert abs(delta - 3) < 0.01


class TestUpdateStabilityStub:
    def test_forgotten_quality_halves_stability(self):
        for q in (0, 1, 2):
            s_new = update_stability_stub(q, 4.0)
            assert s_new < 4.0, f"quality={q} should decrease stability"

    def test_forgotten_quality_minimum_stability_is_one(self):
        s_new = update_stability_stub(0, 0.5)
        assert s_new >= 1.0

    def test_quality_3_maintains_stability(self):
        # quality=3 maps to multiplier 0 → S_new = S*(1+0.1*0) = S (no change)
        s_new = update_stability_stub(3, 4.0)
        assert s_new == 4.0

    def test_quality_5_gives_largest_increase(self):
        s3 = update_stability_stub(3, 4.0)
        s5 = update_stability_stub(5, 4.0)
        assert s5 > s3


# ---------------------------------------------------------------------------
# get_due_items
# ---------------------------------------------------------------------------

@respx.mock
async def test_get_due_items_returns_only_below_threshold():
    respx.get(AGT06_VOCAB_URL).mock(return_value=httpx.Response(200, json=VOCAB_RESPONSE))

    result = await service.get_due_items("user_test")

    # v2 has last_encounter far in the future → r≈1.0 → NOT due
    # v1 has last_encounter=None → days_since=999 → r≈0 → due
    assert len(result) == 1
    assert result[0]["vocab_id"] == "v1"
    assert "retrievability" in result[0]
    assert result[0]["retrievability"] < 0.9


@respx.mock
async def test_get_due_items_sorted_by_retrievability_ascending():
    extra_item = {
        "vocab_id": "v3",
        "word": "ephemeral2",
        "encounter_count": 0,
        "context_sentences": [],
        "sm_stability": 0.5,
        "last_encounter": None,
    }
    vocab = [VOCAB_RESPONSE[0], extra_item]
    respx.get(AGT06_VOCAB_URL).mock(return_value=httpx.Response(200, json=vocab))

    result = await service.get_due_items("user_test")

    assert len(result) == 2
    assert result[0]["retrievability"] <= result[1]["retrievability"]


@respx.mock
async def test_get_due_items_returns_empty_list_on_agt06_failure():
    respx.get(AGT06_VOCAB_URL).mock(return_value=httpx.Response(500))

    result = await service.get_due_items("user_test")
    assert result == []


@respx.mock
async def test_get_due_items_returns_empty_list_on_connection_error():
    respx.get(AGT06_VOCAB_URL).mock(side_effect=httpx.ConnectError("refused"))

    result = await service.get_due_items("user_test")
    assert result == []


@respx.mock
async def test_get_due_items_all_current_returns_empty():
    fresh_vocab = [{
        "vocab_id": "v-fresh",
        "word": "fresh",
        "encounter_count": 1,
        "context_sentences": [],
        "sm_stability": 100.0,  # very stable
        "last_encounter": "2099-06-01T00:00:00+00:00",  # far future → very fresh
    }]
    respx.get(AGT06_VOCAB_URL).mock(return_value=httpx.Response(200, json=fresh_vocab))

    result = await service.get_due_items("user_test")
    assert result == []


# ---------------------------------------------------------------------------
# rate_item
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_db(monkeypatch):
    calls: dict = {}

    async def fake_fetchrow(query, *args):
        calls["fetchrow"] = args
        return {"sm_stability": 2.0}

    async def fake_execute(query, *args):
        calls["execute"] = args
        return "UPDATE 1"

    monkeypatch.setattr("agents.agt07_review.service.fetchrow", fake_fetchrow)
    monkeypatch.setattr("agents.agt07_review.service.execute", fake_execute)
    return calls


async def test_rate_item_returns_shape(mock_db):
    result = await service.rate_item("user_test", "v1", 4)

    assert result["item_id"] == "v1"
    assert result["quality"] == 4
    assert "next_review" in result
    assert "new_stability" in result


async def test_rate_item_next_review_is_iso_string(mock_db):
    result = await service.rate_item("user_test", "v1", 5)
    datetime.fromisoformat(result["next_review"])


@pytest.mark.parametrize("quality", [0, 1, 2, 3, 4, 5])
async def test_rate_item_all_quality_levels(quality: int, mock_db):
    result = await service.rate_item("user_test", "v1", quality)
    assert result["quality"] == quality


@pytest.fixture
def mock_db_missing(monkeypatch):
    calls: dict = {}

    async def fake_fetchrow(query, *args):
        calls["fetchrow"] = args
        return None

    async def fake_execute(query, *args):
        calls["execute"] = args
        return "UPDATE 0"

    monkeypatch.setattr("agents.agt07_review.service.fetchrow", fake_fetchrow)
    monkeypatch.setattr("agents.agt07_review.service.execute", fake_execute)
    return calls


async def test_rate_item_raises_value_error_when_item_not_found(mock_db_missing):
    with pytest.raises(ValueError):
        await service.rate_item("user_x", "nonexistent-uuid", 4)
    assert "fetchrow" in mock_db_missing
    assert "execute" not in mock_db_missing


async def test_rate_item_raises_value_error_when_wrong_user(mock_db_missing):
    with pytest.raises(ValueError):
        await service.rate_item("wrong_user", "some-uuid", 3)
    assert "fetchrow" in mock_db_missing
    assert "execute" not in mock_db_missing


# ---------------------------------------------------------------------------
# build_daily_test
# ---------------------------------------------------------------------------

@respx.mock
async def test_build_daily_test_returns_correct_size():
    # Need ≥5 unique grammar error types and ≥5 vocab items for size=10
    vocab = VOCAB_RESPONSE * 5  # 10 vocab items
    errors = [
        {"error_type": "verb_tense", "skill_domain": "SPEAKING", "context_excerpt": "ex1"},
        {"error_type": "article", "skill_domain": "WRITING", "context_excerpt": "ex2"},
        {"error_type": "preposition", "skill_domain": "READING", "context_excerpt": "ex3"},
        {"error_type": "subject_verb", "skill_domain": "WRITING", "context_excerpt": "ex4"},
        {"error_type": "modal", "skill_domain": "SPEAKING", "context_excerpt": "ex5"},
    ]
    respx.get(AGT06_VOCAB_URL + "?limit=50").mock(return_value=httpx.Response(200, json=vocab))
    respx.get(AGT06_ERRORS_URL + "?limit=50").mock(return_value=httpx.Response(200, json=errors))

    result = await service.build_daily_test("user_test", size=10)
    assert len(result) == 10


@respx.mock
async def test_build_daily_test_contains_vocab_and_grammar():
    respx.get(AGT06_VOCAB_URL + "?limit=50").mock(return_value=httpx.Response(200, json=VOCAB_RESPONSE * 5))
    respx.get(AGT06_ERRORS_URL + "?limit=50").mock(return_value=httpx.Response(200, json=ERRORS_RESPONSE * 5))

    result = await service.build_daily_test("user_test", size=6)
    types = {item["type"] for item in result}
    assert "vocabulary" in types
    assert "grammar" in types


@respx.mock
async def test_build_daily_test_returns_empty_on_agt06_failure():
    respx.get(AGT06_VOCAB_URL + "?limit=50").mock(return_value=httpx.Response(500))
    respx.get(AGT06_ERRORS_URL + "?limit=50").mock(return_value=httpx.Response(200, json=[]))

    result = await service.build_daily_test("user_test", size=10)
    assert result == []


# ---------------------------------------------------------------------------
# pick_vocab_of_the_day
# ---------------------------------------------------------------------------

@respx.mock
async def test_pick_vocab_of_the_day_returns_least_encountered():
    respx.get(AGT06_VOCAB_URL + "?limit=50").mock(return_value=httpx.Response(200, json=VOCAB_RESPONSE))

    result = await service.pick_vocab_of_the_day("user_test")

    assert result is not None
    # v1 has encounter_count=1, v2 has 5 → v1 is least familiar
    assert result["vocabItemId"] == "v1"
    assert result["term"] == "ephemeral"
    assert result["meaning"] == ""
    assert result["exampleSentence"] == "Life is ephemeral."


@respx.mock
async def test_pick_vocab_of_the_day_none_on_empty_vocab():
    respx.get(AGT06_VOCAB_URL + "?limit=50").mock(return_value=httpx.Response(200, json=[]))

    result = await service.pick_vocab_of_the_day("user_test")
    assert result is None


@respx.mock
async def test_pick_vocab_of_the_day_none_on_agt06_failure():
    respx.get(AGT06_VOCAB_URL + "?limit=50").mock(return_value=httpx.Response(500))

    result = await service.pick_vocab_of_the_day("user_test")
    assert result is None


@respx.mock
async def test_pick_vocab_of_the_day_null_example_sentence_when_no_context():
    no_context = [{
        "vocab_id": "v-no-ctx",
        "word": "numinous",
        "encounter_count": 0,
        "context_sentences": [],
    }]
    respx.get(AGT06_VOCAB_URL + "?limit=50").mock(return_value=httpx.Response(200, json=no_context))

    result = await service.pick_vocab_of_the_day("user_test")
    assert result is not None
    assert result["exampleSentence"] is None

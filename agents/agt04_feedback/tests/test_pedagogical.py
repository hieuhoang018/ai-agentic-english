import pytest
from agents.agt04_feedback.pedagogical import (
    FILLER_WORDS,
    FeedbackStrategy,
    select_strategy,
    should_throttle,
)


# ── FILLER_WORDS contract ────────────────────────────────────────────────────

def test_filler_words_contains_no_multi_word_entries():
    for entry in FILLER_WORDS:
        assert " " not in entry, f"Multi-word entry found: '{entry}'"


def test_filler_words_contains_common_fillers():
    for word in ("um", "uh", "like", "basically", "literally"):
        assert word in FILLER_WORDS, f"Expected '{word}' in FILLER_WORDS"


# ── select_strategy ──────────────────────────────────────────────────────────

def test_select_strategy_untaught_returns_recast():
    assert select_strategy("grammar", is_taught=False, failure_count=0) == FeedbackStrategy.RECAST


def test_select_strategy_taught_zero_failures_returns_metalinguistic():
    assert select_strategy("grammar", is_taught=True, failure_count=0) == FeedbackStrategy.METALINGUISTIC


def test_select_strategy_taught_two_failures_returns_metalinguistic():
    assert select_strategy("grammar", is_taught=True, failure_count=2) == FeedbackStrategy.METALINGUISTIC


def test_select_strategy_taught_three_failures_returns_elicitation():
    assert select_strategy("grammar", is_taught=True, failure_count=3) == FeedbackStrategy.ELICITATION


def test_select_strategy_taught_many_failures_returns_elicitation():
    assert select_strategy("vocabulary", is_taught=True, failure_count=10) == FeedbackStrategy.ELICITATION


# ── should_throttle ──────────────────────────────────────────────────────────

def test_should_throttle_empty_list_no_throttle():
    throttled, priority = should_throttle([])
    assert throttled is False
    assert priority is None


def test_should_throttle_three_types_no_throttle():
    throttled, priority = should_throttle(["grammar", "vocabulary", "fluency"])
    assert throttled is False


def test_should_throttle_four_types_triggers():
    throttled, priority = should_throttle(["grammar", "vocabulary", "fluency", "register"])
    assert throttled is True


def test_should_throttle_returns_highest_severity_type():
    # grammar=4, vocabulary=3, fluency=1, coherence=3
    throttled, priority = should_throttle(["fluency", "vocabulary", "coherence", "grammar"])
    assert throttled is True
    assert priority == "grammar"


def test_should_throttle_unknown_type_has_zero_severity():
    # unknown type gets severity 0 — grammar wins
    throttled, priority = should_throttle(["unknown_type", "vocabulary", "coherence", "grammar"])
    assert throttled is True
    assert priority == "grammar"

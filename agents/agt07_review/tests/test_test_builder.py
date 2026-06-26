"""Unit tests for agents.agt07_review.test_builder.compose_test_stub."""
import pytest
from agents.agt07_review.test_builder import compose_test_stub


def _vocab(n):
    return [{"word": f"word{i}", "context_sentences": [f"Sentence {i}."]} for i in range(n)]


def _errors(n, error_type="verb_tense"):
    return [{"error_type": f"{error_type}_{i}", "skill_domain": "SPEAKING", "context_excerpt": f"err {i}"} for i in range(n)]


def test_compose_test_stub_empty_inputs_returns_empty():
    result = compose_test_stub([], [])
    assert result == []


def test_compose_test_stub_fifty_fifty_split():
    result = compose_test_stub(_vocab(6), _errors(6), test_size=4)
    assert len(result) == 4
    assert sum(1 for item in result if item["type"] == "vocabulary") == 2
    assert sum(1 for item in result if item["type"] == "grammar") == 2


def test_compose_test_stub_respects_test_size():
    result = compose_test_stub(_vocab(10), _errors(10), test_size=6)
    assert len(result) == 6


def test_compose_test_stub_deduplicates_error_types():
    errors = [
        {"error_type": "verb_tense", "skill_domain": s, "context_excerpt": ""}
        for s in ["SPEAKING", "WRITING", "READING"]
    ]
    result = compose_test_stub([], errors, test_size=10)
    grammar_items = [item for item in result if item["type"] == "grammar"]
    assert len(grammar_items) == 1
    assert result[0]["error_type"] == "verb_tense"


def test_compose_test_stub_vocab_item_structure():
    vocab = [{"word": "ephemeral", "context_sentences": ["Nothing is ephemeral.", "Second sentence."]}]
    result = compose_test_stub(vocab, [], test_size=2)
    assert len(result) == 1
    assert result[0]["type"] == "vocabulary"
    assert result[0]["word"] == "ephemeral"
    assert result[0]["context"] == "Nothing is ephemeral."


def test_compose_test_stub_grammar_item_structure():
    errors = [{"error_type": "verb_tense", "skill_domain": "SPEAKING", "context_excerpt": "She go to school."}]
    result = compose_test_stub([], errors, test_size=2)
    assert len(result) == 1
    assert result[0]["type"] == "grammar"
    assert result[0]["error_type"] == "verb_tense"
    assert result[0]["skill_domain"] == "SPEAKING"
    assert result[0]["context"] == "She go to school."

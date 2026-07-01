from __future__ import annotations

import inspect
import pytest

from agents.agt06_memory.ltm import _vec_to_str, _ALLOWED_PROFILE_FIELDS, update_profile
from agents.agt06_memory import ltm as ltm_module


def test_vec_to_str_no_spaces():
    assert _vec_to_str([0.0, 1.0]) == "[0.0,1.0]"


def test_vec_to_str_single_element():
    assert _vec_to_str([0.5]) == "[0.5]"


def test_vec_to_str_typical_embedding():
    v = [0.1, 0.2, 0.3, 0.4]
    result = _vec_to_str(v)
    assert " " not in result
    assert result.startswith("[")
    assert result.endswith("]")


def test_vec_to_str_empty():
    assert _vec_to_str([]) == "[]"


def test_allowed_profile_fields_are_defined():
    assert "skill_scores" in _ALLOWED_PROFILE_FIELDS
    assert "error_patterns" in _ALLOWED_PROFILE_FIELDS
    assert "behavioral_profile" in _ALLOWED_PROFILE_FIELDS


@pytest.mark.asyncio
async def test_update_profile_rejects_unknown_field():
    with pytest.raises(ValueError, match="disallowed fields"):
        await update_profile("user1", {"injected_field": "value"})


@pytest.mark.asyncio
async def test_update_profile_rejects_mixed_fields():
    with pytest.raises(ValueError, match="disallowed fields"):
        await update_profile("user1", {"skill_scores": {}, "injected_field": "value"})


def test_upsert_vocab_increments_sm_retrievability():
    """The ON CONFLICT clause must increment sm_retrievability, not decrement."""
    # Find the SQL string in the module source that handles vocab upsert.
    # The correct direction is + 0.05 capped at 1.0.
    source = inspect.getsource(ltm_module)
    # Confirm increment direction is present
    assert "sm_retrievability + 0.05" in source or "+ 0.05" in source, (
        "upsert_vocab must increment sm_retrievability (+ 0.05), not decrement it"
    )
    # Confirm decrement direction is NOT present
    assert "sm_retrievability - 0.05" not in source, (
        "Found decrement direction (- 0.05) — must be increment"
    )


@pytest.mark.asyncio
async def test_get_assessment_history_returns_ordered_theta_series(monkeypatch):
    rows = [
        {"irt_score": 0.5, "assessed_at": "2026-06-01T10:00:00+00:00", "skill_domain": "READING"},
        {"irt_score": 0.8, "assessed_at": "2026-06-15T10:00:00+00:00", "skill_domain": "READING"},
    ]

    async def fake_fetch(query, *args):
        return rows

    monkeypatch.setattr("agents.agt06_memory.ltm.fetch", fake_fetch)

    from agents.agt06_memory.ltm import get_assessment_history
    result = await get_assessment_history("user1", "READING")

    assert result == [
        {"irt_score": 0.5, "assessed_at": "2026-06-01T10:00:00+00:00", "skill_domain": "READING"},
        {"irt_score": 0.8, "assessed_at": "2026-06-15T10:00:00+00:00", "skill_domain": "READING"},
    ]


@pytest.mark.asyncio
async def test_get_assessment_history_empty_when_no_rows(monkeypatch):
    async def fake_fetch(query, *args):
        return []

    monkeypatch.setattr("agents.agt06_memory.ltm.fetch", fake_fetch)

    from agents.agt06_memory.ltm import get_assessment_history
    result = await get_assessment_history("user1", "WRITING")

    assert result == []

import json
import pytest
from unittest.mock import AsyncMock, patch
from agents.agt05_assessment.service import record_response


@pytest.fixture
def capture_execute(monkeypatch):
    """Capture all calls to the postgres execute function."""
    calls: list[dict] = []

    async def fake_execute(query: str, *args):
        calls.append({"query": query, "args": args})

    monkeypatch.setattr("agents.agt05_assessment.service.execute", fake_execute)
    return calls


@pytest.fixture
def mock_item_bank(monkeypatch):
    """Return a non-empty item bank so the non-termination path gets a next item."""
    items = [
        {"item_id": f"item-{i}", "difficulty_param": round(i / 15.0 - 1.0, 3)}
        for i in range(1, 13)  # 12 items — matches the real LMS bank size, not 30
    ]

    async def fake_fetch(skill_domain: str) -> list[dict]:
        return items

    monkeypatch.setattr(
        "agents.agt05_assessment.service._fetch_item_bank", fake_fetch
    )
    return items


def _build_prior_with_difficulty(correct_count: int, total: int, items: list[dict]) -> list[dict]:
    """Build prior_responses carrying difficulty_param, as the real client contract requires."""
    return [
        {"item_id": items[i - 1]["item_id"], "difficulty_param": items[i - 1]["difficulty_param"],
         "correct": i <= correct_count}
        for i in range(1, total + 1)
    ]


# ── termination path ──────────────────────────────────────────────────────────

async def test_terminates_at_item_bank_size_not_fixed_30(capture_execute, mock_item_bank):
    """With a 12-item bank, the session must terminate at item 12, not 30 —
    this is the regression test for the item-bank-size cap fixed in Task B3."""
    prior = _build_prior_with_difficulty(correct_count=6, total=11, items=mock_item_bank)
    last_item = mock_item_bank[11]
    result = await record_response(
        assessment_id="test-cap",
        item_id=last_item["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    assert result["terminated"] is True
    assert result["items_answered"] == 12


async def test_record_response_attaches_difficulty_to_current_item_before_eap(capture_execute, mock_item_bank):
    """The difficulty of the item being answered right now must be looked up
    from the item bank and included when computing theta — not just the
    difficulties of items already in prior_responses."""
    prior = _build_prior_with_difficulty(correct_count=2, total=3, items=mock_item_bank)
    current = mock_item_bank[3]
    result = await record_response(
        assessment_id="test-difficulty",
        item_id=current["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    # Not terminated yet (4 of 12 answered); current_theta must be a real EAP
    # value, not 0.0 (which would indicate the current item's difficulty was
    # silently dropped, e.g. by a KeyError being swallowed somewhere).
    assert result["terminated"] is False
    assert result["current_theta"] != 0.0


async def test_assessment_id_and_skill_domain_returned_unchanged(capture_execute, mock_item_bank):
    prior = _build_prior_with_difficulty(correct_count=10, total=11, items=mock_item_bank)
    last_item = mock_item_bank[11]
    result = await record_response(
        assessment_id="custom-id-xyz",
        item_id=last_item["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="SPEAKING",
        clerk_user_id="test-user",
    )
    assert result["assessment_id"] == "custom-id-xyz"
    assert result["skill_domain"] == "SPEAKING"


# ── postgres write verification ───────────────────────────────────────────────

async def test_terminates_writes_exactly_one_postgres_row(capture_execute, mock_item_bank):
    prior = _build_prior_with_difficulty(correct_count=6, total=11, items=mock_item_bank)
    last_item = mock_item_bank[11]
    await record_response(
        assessment_id="test-001",
        item_id=last_item["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    assert len(capture_execute) == 1


async def test_postgres_args_clerk_user_id(capture_execute, mock_item_bank):
    prior = _build_prior_with_difficulty(correct_count=6, total=11, items=mock_item_bank)
    last_item = mock_item_bank[11]
    await record_response(
        assessment_id="test-001",
        item_id=last_item["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="user-abc-123",
    )
    args = capture_execute[0]["args"]
    assert args[0] == "user-abc-123"  # $1 clerk_user_id


async def test_postgres_args_skill_domain(capture_execute, mock_item_bank):
    prior = _build_prior_with_difficulty(correct_count=6, total=11, items=mock_item_bank)
    last_item = mock_item_bank[11]
    await record_response(
        assessment_id="test-001",
        item_id=last_item["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="WRITING",
        clerk_user_id="test-user",
    )
    args = capture_execute[0]["args"]
    assert args[1] == "WRITING"  # $2 skill_domain


async def test_postgres_args_item_id_is_first_response_item(capture_execute, mock_item_bank):
    """item_id column must store the first item's ID from the response list, not the session UUID."""
    prior = _build_prior_with_difficulty(correct_count=6, total=11, items=mock_item_bank)
    last_item = mock_item_bank[11]
    await record_response(
        assessment_id="my-assessment-999",
        item_id=last_item["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    args = capture_execute[0]["args"]
    # $3 item_id: first item in the full responses list is prior[0] = "item-1"
    assert args[2] == "item-1"


async def test_postgres_args_assessment_session_id_is_session_uuid(capture_execute, mock_item_bank):
    """assessment_session_id column must store the session-level assessment_id UUID."""
    prior = _build_prior_with_difficulty(correct_count=6, total=11, items=mock_item_bank)
    last_item = mock_item_bank[11]
    await record_response(
        assessment_id="my-assessment-999",
        item_id=last_item["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    args = capture_execute[0]["args"]
    # $4 assessment_session_id: must be the session-level UUID
    assert args[3] == "my-assessment-999"


async def test_postgres_query_contains_assessment_session_id_column(capture_execute, mock_item_bank):
    """The INSERT query must reference assessment_session_id column, not just item_id for the session."""
    prior = _build_prior_with_difficulty(correct_count=6, total=11, items=mock_item_bank)
    last_item = mock_item_bank[11]
    await record_response(
        assessment_id="test-001",
        item_id=last_item["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    query = capture_execute[0]["query"]
    assert "assessment_session_id" in query


async def test_postgres_args_response_is_valid_json(capture_execute, mock_item_bank):
    prior = _build_prior_with_difficulty(correct_count=6, total=11, items=mock_item_bank)
    last_item = mock_item_bank[11]
    await record_response(
        assessment_id="test-001",
        item_id=last_item["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    args = capture_execute[0]["args"]
    response_json = args[4]  # $5 response JSONB (after clerk_user_id, skill_domain, item_id, assessment_session_id)
    parsed = json.loads(response_json)
    assert isinstance(parsed, list)
    assert len(parsed) == 12  # 11 prior + 1 current, capped at the 12-item bank size


# ── non-termination path ──────────────────────────────────────────────────────

async def test_does_not_write_postgres_when_not_terminated(mock_item_bank, capture_execute):
    # 3 prior + 1 current = 4 responses — below the 12-item bank-size threshold
    prior = _build_prior_with_difficulty(correct_count=2, total=3, items=mock_item_bank)
    current = mock_item_bank[3]
    result = await record_response(
        assessment_id="test-001",
        item_id=current["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    assert result["terminated"] is False
    assert len(capture_execute) == 0


async def test_non_terminated_returns_current_item(mock_item_bank, capture_execute):
    prior = _build_prior_with_difficulty(correct_count=2, total=3, items=mock_item_bank)
    current = mock_item_bank[3]
    result = await record_response(
        assessment_id="test-001",
        item_id=current["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    assert result["terminated"] is False
    assert result["current_item"] is not None
    assert "item_id" in result["current_item"]


async def test_non_terminated_items_answered_count(mock_item_bank, capture_execute):
    prior = _build_prior_with_difficulty(correct_count=2, total=3, items=mock_item_bank)
    current = mock_item_bank[3]
    result = await record_response(
        assessment_id="test-001",
        item_id=current["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    assert result["items_answered"] == 4


# ── start_assessment ──────────────────────────────────────────────────────────

@pytest.fixture
def mock_item_bank_start(monkeypatch):
    items = [
        {"item_id": f"item-{i}", "difficulty_param": round(i / 15.0 - 1.0, 3)}
        for i in range(1, 31)
    ]
    async def fake_fetch(skill_domain):
        return items
    monkeypatch.setattr("agents.agt05_assessment.service._fetch_item_bank", fake_fetch)
    return items


async def test_start_assessment_returns_assessment_id(mock_item_bank_start):
    from agents.agt05_assessment.service import start_assessment
    result = await start_assessment("user-001", "READING")
    assert "assessment_id" in result
    assert result["assessment_id"] != ""


async def test_start_assessment_id_contains_user_id(mock_item_bank_start):
    from agents.agt05_assessment.service import start_assessment
    result = await start_assessment("user-abc", "READING")
    assert "user-abc" in result["assessment_id"]


async def test_start_assessment_ids_unique_across_calls(mock_item_bank_start):
    """Two calls for the same user+skill must produce different assessment IDs."""
    from agents.agt05_assessment.service import start_assessment
    r1 = await start_assessment("user-001", "READING")
    r2 = await start_assessment("user-001", "READING")
    assert r1["assessment_id"] != r2["assessment_id"]


async def test_start_assessment_returns_first_item(mock_item_bank_start):
    from agents.agt05_assessment.service import start_assessment
    result = await start_assessment("user-001", "READING")
    assert result["current_item"] is not None
    assert "item_id" in result["current_item"]


async def test_start_assessment_initial_state(mock_item_bank_start):
    from agents.agt05_assessment.service import start_assessment
    result = await start_assessment("user-001", "READING")
    assert result["current_theta"] == 0.0
    assert result["items_answered"] == 0
    assert result["terminated"] is False


async def test_start_assessment_item_bank_unavailable(monkeypatch):
    import agents.agt05_assessment.service as svc
    monkeypatch.setattr(svc, "_fetch_item_bank", AsyncMock(return_value=[]))
    from agents.agt05_assessment.service import start_assessment
    result = await start_assessment("user-001", "READING")
    assert "error" in result
    assert result["skill_domain"] == "READING"


async def test_start_assessment_rejects_speaking():
    from agents.agt05_assessment.service import start_assessment
    result = await start_assessment("user-001", "SPEAKING")
    assert result["http_status"] == 422
    assert result["skill_domain"] == "SPEAKING"
    assert "error" in result


async def test_start_assessment_model_rejects_speaking():
    from agents.agt05_assessment.models import StartAssessmentRequest
    import pytest
    with pytest.raises(Exception, match="SPEAKING cannot be assessed via CAT"):
        StartAssessmentRequest(clerk_user_id="user-001", skill_domain="SPEAKING")


# ── D9: Postgres error handling ───────────────────────────────────────────────

async def test_postgres_error_does_not_propagate_on_termination(monkeypatch, mock_item_bank):
    """Postgres write failure at termination must be caught; response still returned."""
    async def failing_execute(query, *args):
        raise Exception("Postgres connection lost")

    monkeypatch.setattr("agents.agt05_assessment.service.execute", failing_execute)
    prior = _build_prior_with_difficulty(correct_count=9, total=11, items=mock_item_bank)
    last_item = mock_item_bank[11]
    result = await record_response(
        assessment_id="test-pg-err",
        item_id=last_item["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="user-pg",
    )
    # Must return a valid termination shape despite DB failure
    assert result["terminated"] is True
    assert "cefr_band" in result
    assert "final_theta" in result


async def test_postgres_error_result_has_correct_cefr(monkeypatch, mock_item_bank):
    async def failing_execute(query, *args):
        raise Exception("Postgres connection lost")

    monkeypatch.setattr("agents.agt05_assessment.service.execute", failing_execute)
    prior = _build_prior_with_difficulty(correct_count=9, total=11, items=mock_item_bank)
    last_item = mock_item_bank[11]
    result = await record_response(
        assessment_id="test-pg-err",
        item_id=last_item["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="user-pg",
    )
    assert "cefr_band" in result
    assert result["cefr_band"] in {"A1", "A2", "B1", "B2", "C1", "C2"}


# ── D10: early-exhaustion response shape ─────────────────────────────────────

@pytest.fixture
def early_exhaustion_setup(monkeypatch, mock_item_bank):
    """Item bank runs out before the SE/bank-size threshold is naturally reached."""
    monkeypatch.setattr(
        "agents.agt05_assessment.service.select_next_item_eap",
        lambda theta, answered_ids, bank: None,  # always exhausted
    )
    monkeypatch.setattr(
        "agents.agt05_assessment.service.should_terminate_eap",
        lambda responses, theta, item_bank_size, max_items=30: False,  # not at threshold yet
    )


async def test_early_exhaustion_returns_terminated_true(early_exhaustion_setup, capture_execute, mock_item_bank):
    prior = _build_prior_with_difficulty(correct_count=3, total=4, items=mock_item_bank)
    current = mock_item_bank[4]
    result = await record_response(
        assessment_id="test-exhaust",
        item_id=current["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="user-exhaust",
    )
    assert result["terminated"] is True


async def test_early_exhaustion_has_cefr_band(early_exhaustion_setup, capture_execute, mock_item_bank):
    prior = _build_prior_with_difficulty(correct_count=3, total=4, items=mock_item_bank)
    current = mock_item_bank[4]
    result = await record_response(
        assessment_id="test-exhaust",
        item_id=current["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="user-exhaust",
    )
    assert "cefr_band" in result
    assert result["cefr_band"] != ""


async def test_early_exhaustion_has_final_theta(early_exhaustion_setup, capture_execute, mock_item_bank):
    prior = _build_prior_with_difficulty(correct_count=3, total=4, items=mock_item_bank)
    current = mock_item_bank[4]
    result = await record_response(
        assessment_id="test-exhaust",
        item_id=current["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="user-exhaust",
    )
    assert "final_theta" in result
    assert "confidence_interval" in result


async def test_early_exhaustion_has_no_current_item_key(early_exhaustion_setup, capture_execute, mock_item_bank):
    """current_item must not appear in a terminal response."""
    prior = _build_prior_with_difficulty(correct_count=3, total=4, items=mock_item_bank)
    current = mock_item_bank[4]
    result = await record_response(
        assessment_id="test-exhaust",
        item_id=current["item_id"],
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="user-exhaust",
    )
    assert "current_item" not in result

import json
import pytest
from unittest.mock import AsyncMock, patch
from agents.agt05_assessment.service import record_response


def _build_prior(correct_count: int, total: int = 29) -> list[dict]:
    """Build prior_responses: first `correct_count` items are correct."""
    return [
        {"item_id": f"item-{i}", "correct": i <= correct_count}
        for i in range(1, total + 1)
    ]


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
        for i in range(1, 31)
    ]

    async def fake_fetch(skill_domain: str) -> list[dict]:
        return items

    monkeypatch.setattr(
        "agents.agt05_assessment.service._fetch_item_bank", fake_fetch
    )
    return items


# ── termination path ──────────────────────────────────────────────────────────

async def test_terminates_at_30_items(capture_execute):
    prior = _build_prior(correct_count=16, total=29)
    result = await record_response(
        assessment_id="test-001",
        item_id="item-30",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    assert result["terminated"] is True
    assert result["items_answered"] == 30


async def test_cefr_b1_for_17_of_30(capture_execute):
    # 16 correct in prior + 1 correct = 17/30 → theta ≈ 0.267 → B1
    prior = _build_prior(correct_count=16, total=29)
    result = await record_response(
        assessment_id="test-001",
        item_id="item-30",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    assert result["cefr_band"] == "B1"
    assert result["final_theta"] == pytest.approx(0.267, abs=0.001)


async def test_cefr_a2_for_10_of_30(capture_execute):
    # 9 correct in prior + 1 correct = 10/30 → theta ≈ -0.667 → A2
    prior = _build_prior(correct_count=9, total=29)
    result = await record_response(
        assessment_id="test-002",
        item_id="item-30",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    assert result["cefr_band"] == "A2"
    assert result["final_theta"] == pytest.approx(-0.667, abs=0.001)


async def test_cefr_b2_for_23_of_30(capture_execute):
    # 22 correct in prior + 1 correct = 23/30 → theta ≈ 1.067 → B2
    prior = _build_prior(correct_count=22, total=29)
    result = await record_response(
        assessment_id="test-003",
        item_id="item-30",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    assert result["cefr_band"] == "B2"
    assert result["final_theta"] == pytest.approx(1.067, abs=0.001)


async def test_confidence_interval_is_theta_plus_minus_half(capture_execute):
    prior = _build_prior(correct_count=16, total=29)
    result = await record_response(
        assessment_id="test-001",
        item_id="item-30",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    theta = result["final_theta"]
    ci = result["confidence_interval"]
    assert ci[0] == pytest.approx(theta - 0.5, abs=0.001)
    assert ci[1] == pytest.approx(theta + 0.5, abs=0.001)


async def test_assessment_id_and_skill_domain_returned_unchanged(capture_execute):
    prior = _build_prior(correct_count=16, total=29)
    result = await record_response(
        assessment_id="custom-id-xyz",
        item_id="item-30",
        correct=True,
        prior_responses=prior,
        skill_domain="SPEAKING",
        clerk_user_id="test-user",
    )
    assert result["assessment_id"] == "custom-id-xyz"
    assert result["skill_domain"] == "SPEAKING"


# ── postgres write verification ───────────────────────────────────────────────

async def test_terminates_writes_exactly_one_postgres_row(capture_execute):
    prior = _build_prior(correct_count=16, total=29)
    await record_response(
        assessment_id="test-001",
        item_id="item-30",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    assert len(capture_execute) == 1


async def test_postgres_args_clerk_user_id(capture_execute):
    prior = _build_prior(correct_count=16, total=29)
    await record_response(
        assessment_id="test-001",
        item_id="item-30",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="user-abc-123",
    )
    args = capture_execute[0]["args"]
    assert args[0] == "user-abc-123"  # $1 clerk_user_id


async def test_postgres_args_skill_domain(capture_execute):
    prior = _build_prior(correct_count=16, total=29)
    await record_response(
        assessment_id="test-001",
        item_id="item-30",
        correct=True,
        prior_responses=prior,
        skill_domain="WRITING",
        clerk_user_id="test-user",
    )
    args = capture_execute[0]["args"]
    assert args[1] == "WRITING"  # $2 skill_domain


async def test_postgres_args_assessment_id_as_item_id(capture_execute):
    prior = _build_prior(correct_count=16, total=29)
    await record_response(
        assessment_id="my-assessment-999",
        item_id="item-30",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    args = capture_execute[0]["args"]
    assert args[2] == "my-assessment-999"  # $3 assessment_id stored in item_id column


async def test_postgres_args_response_is_valid_json(capture_execute):
    prior = _build_prior(correct_count=16, total=29)
    await record_response(
        assessment_id="test-001",
        item_id="item-30",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    args = capture_execute[0]["args"]
    response_json = args[3]  # $4 response JSONB
    parsed = json.loads(response_json)
    assert isinstance(parsed, list)
    assert len(parsed) == 30  # 29 prior + 1 current


# ── non-termination path ──────────────────────────────────────────────────────

async def test_does_not_write_postgres_when_not_terminated(mock_item_bank, capture_execute):
    # 27 prior + 1 current = 28 responses — below threshold of 30
    prior = _build_prior(correct_count=15, total=27)
    result = await record_response(
        assessment_id="test-001",
        item_id="item-28",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    assert result["terminated"] is False
    assert len(capture_execute) == 0


async def test_non_terminated_returns_current_item(mock_item_bank, capture_execute):
    prior = _build_prior(correct_count=15, total=27)
    result = await record_response(
        assessment_id="test-001",
        item_id="item-28",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    assert result["terminated"] is False
    assert result["current_item"] is not None
    assert "item_id" in result["current_item"]


async def test_non_terminated_items_answered_count(mock_item_bank, capture_execute):
    prior = _build_prior(correct_count=15, total=27)
    result = await record_response(
        assessment_id="test-001",
        item_id="item-28",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="test-user",
    )
    assert result["items_answered"] == 28


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

async def test_postgres_error_does_not_propagate_on_termination(monkeypatch):
    """Postgres write failure at termination must be caught; response still returned."""
    async def failing_execute(query, *args):
        raise Exception("Postgres connection lost")

    monkeypatch.setattr("agents.agt05_assessment.service.execute", failing_execute)
    prior = _build_prior(correct_count=16, total=29)
    result = await record_response(
        assessment_id="test-pg-err",
        item_id="item-30",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="user-pg",
    )
    # Must return a valid termination shape despite DB failure
    assert result["terminated"] is True
    assert "cefr_band" in result
    assert "final_theta" in result


async def test_postgres_error_result_has_correct_cefr(monkeypatch):
    async def failing_execute(query, *args):
        raise Exception("Postgres connection lost")

    monkeypatch.setattr("agents.agt05_assessment.service.execute", failing_execute)
    prior = _build_prior(correct_count=16, total=29)
    result = await record_response(
        assessment_id="test-pg-err",
        item_id="item-30",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="user-pg",
    )
    assert result["cefr_band"] == "B1"


# ── D10: early-exhaustion response shape ─────────────────────────────────────

@pytest.fixture
def early_exhaustion_setup(monkeypatch, mock_item_bank):
    """Item bank runs out after 5 items (well below 30-item threshold)."""
    monkeypatch.setattr(
        "agents.agt05_assessment.service.select_next_item_stub",
        lambda theta, answered_ids, bank: None,  # always exhausted
    )
    monkeypatch.setattr(
        "agents.agt05_assessment.service.should_terminate",
        lambda responses: False,  # not at 30-item threshold
    )


async def test_early_exhaustion_returns_terminated_true(early_exhaustion_setup, capture_execute):
    prior = _build_prior(correct_count=3, total=4)
    result = await record_response(
        assessment_id="test-exhaust",
        item_id="item-5",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="user-exhaust",
    )
    assert result["terminated"] is True


async def test_early_exhaustion_has_cefr_band(early_exhaustion_setup, capture_execute):
    prior = _build_prior(correct_count=3, total=4)
    result = await record_response(
        assessment_id="test-exhaust",
        item_id="item-5",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="user-exhaust",
    )
    assert "cefr_band" in result
    assert result["cefr_band"] != ""


async def test_early_exhaustion_has_final_theta(early_exhaustion_setup, capture_execute):
    prior = _build_prior(correct_count=3, total=4)
    result = await record_response(
        assessment_id="test-exhaust",
        item_id="item-5",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="user-exhaust",
    )
    assert "final_theta" in result
    assert "confidence_interval" in result


async def test_early_exhaustion_has_no_current_item_key(early_exhaustion_setup, capture_execute):
    """current_item must not appear in a terminal response."""
    prior = _build_prior(correct_count=3, total=4)
    result = await record_response(
        assessment_id="test-exhaust",
        item_id="item-5",
        correct=True,
        prior_responses=prior,
        skill_domain="READING",
        clerk_user_id="user-exhaust",
    )
    assert "current_item" not in result

"""
Tests for AGT-07 offline package assembly and sync replay.

All DB calls and AGT-06 HTTP calls are mocked — pure unit tests that require
no live Postgres or network connection.
"""

import pytest
import httpx
import respx
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock

import agents.agt07_review.offline as offline_module
import agents.agt07_review.service as service_module
from agents.shared.config import settings as _settings
from agents.shared.testing import auth_header

AGT06_VOCAB_URL = f"{_settings.AGT06_BASE_URL}/ltm/user_test/vocabulary"
AGT06_ERRORS_URL = f"{_settings.AGT06_BASE_URL}/ltm/user_test/errors"

VOCAB_RESPONSE = [
    {
        "vocab_id": "vocab-1",
        "word": "ephemeral",
        "encounter_count": 1,
        "context_sentences": ["Life is ephemeral."],
        "sm_stability": 1.0,
        "sm_retrievability": 0.5,
        "last_encounter": None,
    }
]

ERRORS_RESPONSE = [
    {"error_type": "verb_tense", "skill_domain": "SPEAKING", "context_excerpt": "I go there yesterday"},
]

SM2_DB_ROWS = [
    {
        "vocab_id": "vocab-1",
        "word": "ephemeral",
        "sm_stability": 1.0,
        "sm_retrievability": 0.5,
        "next_review_at": None,
        "last_encounter": None,
        "encounter_count": 1,
    }
]


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_db_online(monkeypatch):
    """Mock DB for a single successful rate_item call."""
    async def fake_fetchrow(query, *args):
        return {"sm_stability": 2.0}

    async def fake_execute(query, *args):
        return "UPDATE 1"

    monkeypatch.setattr("agents.agt07_review.service.fetchrow", fake_fetchrow)
    monkeypatch.setattr("agents.agt07_review.service.execute", fake_execute)


@pytest.fixture
def mock_db_offline(monkeypatch):
    """
    Mock DB for offline sync: log INSERT succeeds (new row), rate_item succeeds.
    execute returns "INSERT 0 1" for the log claim so the sync proceeds.
    """
    async def fake_fetchrow(query, *args):
        return {"sm_stability": 2.0}

    async def fake_execute(query, *args):
        if "INSERT INTO offline_review_log" in query:
            return "INSERT 0 1"
        return "UPDATE 1"

    monkeypatch.setattr("agents.agt07_review.offline.execute", fake_execute)
    monkeypatch.setattr("agents.agt07_review.service.fetchrow", fake_fetchrow)
    monkeypatch.setattr("agents.agt07_review.service.execute", fake_execute)


@pytest.fixture
def mock_db_already_processed(monkeypatch):
    """Log INSERT hits ON CONFLICT — review was already processed, skip it."""
    async def fake_fetchrow(query, *args):
        return {"sm_stability": 2.0}

    async def fake_execute(query, *args):
        if "INSERT INTO offline_review_log" in query:
            return "INSERT 0 0"  # conflict: row already exists
        return "UPDATE 1"

    monkeypatch.setattr("agents.agt07_review.offline.execute", fake_execute)
    monkeypatch.setattr("agents.agt07_review.service.fetchrow", fake_fetchrow)
    monkeypatch.setattr("agents.agt07_review.service.execute", fake_execute)


@pytest.fixture
def mock_db_item_not_found(monkeypatch):
    """Log INSERT succeeds, but rate_item raises ValueError (item not in DB)."""
    async def fake_fetchrow(query, *args):
        return None  # vocabulary_mastery row not found → triggers ValueError

    async def fake_execute(query, *args):
        if "INSERT INTO offline_review_log" in query:
            return "INSERT 0 1"
        if "DELETE FROM offline_review_log" in query:
            return "DELETE 1"  # log claim rolled back on rate_item failure
        return "UPDATE 0"

    monkeypatch.setattr("agents.agt07_review.offline.execute", fake_execute)
    monkeypatch.setattr("agents.agt07_review.service.fetchrow", fake_fetchrow)
    monkeypatch.setattr("agents.agt07_review.service.execute", fake_execute)


@pytest.fixture
def mock_sm2_fetch(monkeypatch):
    """Mock the fetch() call in _get_sm2_state."""
    async def fake_fetch(query, *args):
        return SM2_DB_ROWS

    monkeypatch.setattr("agents.agt07_review.offline.fetch", fake_fetch)


# ── get_offline_package ───────────────────────────────────────────────────────

@respx.mock
async def test_offline_package_shape(mock_sm2_fetch):
    respx.get(f"{_settings.AGT06_BASE_URL}/ltm/user_test/vocabulary").mock(
        return_value=httpx.Response(200, json=VOCAB_RESPONSE)
    )
    respx.get(f"{_settings.AGT06_BASE_URL}/ltm/user_test/errors").mock(
        return_value=httpx.Response(200, json=ERRORS_RESPONSE)
    )

    result = await offline_module.get_offline_package("user_test")

    assert result["clerk_user_id"] == "user_test"
    assert "generated_at" in result
    assert isinstance(result["flashcards_due"], list)
    assert isinstance(result["sm2_state"], list)
    assert "highlight_snapshot" in result
    assert "recent_errors" in result["highlight_snapshot"]


@respx.mock
async def test_offline_package_sm2_state_contains_vocab(mock_sm2_fetch):
    respx.get(f"{_settings.AGT06_BASE_URL}/ltm/user_test/vocabulary").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.get(f"{_settings.AGT06_BASE_URL}/ltm/user_test/errors").mock(
        return_value=httpx.Response(200, json=[])
    )

    result = await offline_module.get_offline_package("user_test")

    assert len(result["sm2_state"]) == 1
    item = result["sm2_state"][0]
    assert item["vocab_id"] == "vocab-1"
    assert item["word"] == "ephemeral"
    assert isinstance(item["sm_stability"], float)
    assert item["next_review_at"] is None


@respx.mock
async def test_offline_package_highlight_snapshot_empty_on_agt06_failure(mock_sm2_fetch):
    respx.get(f"{_settings.AGT06_BASE_URL}/ltm/user_test/vocabulary").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.get(f"{_settings.AGT06_BASE_URL}/ltm/user_test/errors").mock(
        return_value=httpx.Response(500)
    )

    result = await offline_module.get_offline_package("user_test")

    assert result["highlight_snapshot"]["recent_errors"] == []


@respx.mock
async def test_offline_package_flashcards_due_only_below_threshold(mock_sm2_fetch):
    fresh_vocab = [{
        **VOCAB_RESPONSE[0],
        "sm_stability": 100.0,
        "last_encounter": "2099-01-01T00:00:00+00:00",
    }]
    respx.get(f"{_settings.AGT06_BASE_URL}/ltm/user_test/vocabulary").mock(
        return_value=httpx.Response(200, json=fresh_vocab)
    )
    respx.get(f"{_settings.AGT06_BASE_URL}/ltm/user_test/errors").mock(
        return_value=httpx.Response(200, json=[])
    )

    result = await offline_module.get_offline_package("user_test")

    assert result["flashcards_due"] == []


# ── apply_offline_sync ────────────────────────────────────────────────────────

async def test_sync_applies_single_review(mock_db_offline):
    reviews = [{"review_id": "r-1", "item_id": "vocab-1", "quality": 4, "reviewed_at": None}]

    result = await offline_module.apply_offline_sync("user_test", reviews)

    assert result["applied"] == 1
    assert result["skipped"] == 0
    assert result["errors"] == []


async def test_sync_skips_already_processed_review(mock_db_already_processed):
    reviews = [{"review_id": "review-1", "item_id": "vocab-1", "quality": 4, "reviewed_at": None}]

    result = await offline_module.apply_offline_sync("user_test", reviews)

    assert result["applied"] == 0
    assert result["skipped"] == 1
    assert result["errors"] == []


async def test_sync_idempotent_on_repeated_call(mock_db_already_processed):
    """Replaying the same payload a second time produces all-skipped, no errors."""
    reviews = [
        {"review_id": "review-1", "item_id": "vocab-1", "quality": 3, "reviewed_at": None},
        {"review_id": "review-1", "item_id": "vocab-1", "quality": 3, "reviewed_at": None},
    ]

    result = await offline_module.apply_offline_sync("user_test", reviews)

    assert result["applied"] == 0
    assert result["skipped"] == 2
    assert result["errors"] == []


async def test_sync_captures_item_not_found_in_errors(mock_db_item_not_found):
    reviews = [{"review_id": "r-missing", "item_id": "no-such-item", "quality": 4, "reviewed_at": None}]

    result = await offline_module.apply_offline_sync("user_test", reviews)

    assert result["applied"] == 0
    assert len(result["errors"]) == 1
    assert result["errors"][0]["review_id"] == "r-missing"
    assert "not found" in result["errors"][0]["reason"]


async def test_sync_captures_missing_required_fields(mock_db_offline):
    reviews = [
        {"review_id": None, "item_id": "vocab-1", "quality": 4},  # missing review_id
        {"review_id": "r-2", "item_id": None, "quality": 4},       # missing item_id
        {"review_id": "r-3", "item_id": "vocab-1", "quality": None}, # missing quality
    ]

    result = await offline_module.apply_offline_sync("user_test", reviews)

    assert result["applied"] == 0
    assert result["skipped"] == 0
    assert len(result["errors"]) == 3


async def test_sync_processes_reviews_in_reviewed_at_order(mock_db_offline):
    """Reviews are sorted by reviewed_at before replay — later timestamps processed last."""
    execute_calls: list = []

    async def tracking_execute(query, *args):
        if "vocabulary_mastery" in query:
            execute_calls.append(args[2])  # item_id position in UPDATE args
        return "UPDATE 1"

    async def tracking_fetchrow(query, *args):
        return {"sm_stability": 2.0}

    import agents.agt07_review.offline as om
    import agents.agt07_review.service as sm

    original_execute_offline = om.execute
    original_execute_service = sm.execute
    original_fetchrow_service = sm.fetchrow

    om.execute = tracking_execute
    sm.execute = tracking_execute
    sm.fetchrow = tracking_fetchrow

    try:
        reviews = [
            {"review_id": "r-late", "item_id": "vocab-late", "quality": 4,
             "reviewed_at": "2026-06-29T12:00:00+00:00"},
            {"review_id": "r-early", "item_id": "vocab-early", "quality": 3,
             "reviewed_at": "2026-06-29T08:00:00+00:00"},
        ]
        await offline_module.apply_offline_sync("user_test", reviews)
    finally:
        om.execute = original_execute_offline
        sm.execute = original_execute_service
        sm.fetchrow = original_fetchrow_service

    # early review should be first in execute_calls
    assert execute_calls[0] == "vocab-early"
    assert execute_calls[1] == "vocab-late"


async def test_sync_reviewed_at_anchors_next_review_date(mock_db_offline):
    """
    When reviewed_at is supplied, next_review_at is anchored to it (not now()).
    A past reviewed_at + interval < now() confirms the anchor is being used.
    """
    past_time = "2026-01-01T00:00:00+00:00"
    reviews = [{"review_id": "r-past", "item_id": "vocab-1", "quality": 5, "reviewed_at": past_time}]

    captured_next_review: list = []

    async def capture_execute(query, *args):
        if "UPDATE vocabulary_mastery" in query:
            # args: (new_stability, next_review_at, item_id, clerk_user_id)
            captured_next_review.append(args[1])
        return "UPDATE 1"

    async def fake_fetchrow(query, *args):
        return {"sm_stability": 2.0}

    import agents.agt07_review.offline as om
    import agents.agt07_review.service as sm

    original_execute_s = sm.execute
    original_execute_o = om.execute
    original_fetchrow_s = sm.fetchrow

    sm.fetchrow = fake_fetchrow
    sm.execute = capture_execute
    om.execute = capture_execute

    try:
        await offline_module.apply_offline_sync("user_test", reviews)
    finally:
        sm.execute = original_execute_s
        om.execute = original_execute_o
        sm.fetchrow = original_fetchrow_s

    assert len(captured_next_review) == 1
    next_review_dt = captured_next_review[0]
    # quality=5 → 14-day interval; base is 2026-01-01, so next = 2026-01-15
    expected = datetime(2026, 1, 15, tzinfo=timezone.utc)
    assert abs((next_review_dt - expected).total_seconds()) < 5


# ── HTTP endpoints ────────────────────────────────────────────────────────────

async def test_offline_package_endpoint_returns_200(mock_sm2_fetch):
    import httpx as _httpx
    from httpx import ASGITransport
    from agents.agt07_review.main import app

    with respx.mock:
        respx.get(f"{_settings.AGT06_BASE_URL}/ltm/user_abc/vocabulary").mock(
            return_value=_httpx.Response(200, json=[])
        )
        respx.get(f"{_settings.AGT06_BASE_URL}/ltm/user_abc/errors").mock(
            return_value=_httpx.Response(200, json=[])
        )
        async with _httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/offline/user_abc/package", headers=auth_header("user_abc"))

    assert resp.status_code == 200
    data = resp.json()
    assert data["clerk_user_id"] == "user_abc"
    assert "flashcards_due" in data
    assert "sm2_state" in data
    assert "highlight_snapshot" in data


async def test_offline_package_endpoint_rejects_mismatched_user(mock_sm2_fetch):
    import httpx as _httpx
    from httpx import ASGITransport
    from agents.agt07_review.main import app

    async with _httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/offline/user_abc/package", headers=auth_header("someone-else"))

    assert resp.status_code == 403


async def test_offline_package_endpoint_requires_bearer_token(mock_sm2_fetch):
    import httpx as _httpx
    from httpx import ASGITransport
    from agents.agt07_review.main import app

    async with _httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/offline/user_abc/package")

    assert resp.status_code == 401


async def test_offline_sync_endpoint_returns_result(mock_db_offline):
    import httpx as _httpx
    from httpx import ASGITransport
    from agents.agt07_review.main import app

    payload = {
        "reviews": [
            {"review_id": "r-1", "item_id": "vocab-1", "quality": 4, "reviewed_at": None}
        ]
    }
    async with _httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/offline/user_abc/sync", json=payload, headers=auth_header("user_abc"))

    assert resp.status_code == 200
    data = resp.json()
    assert "applied" in data
    assert "skipped" in data
    assert "errors" in data


async def test_offline_sync_endpoint_rejects_mismatched_user(mock_db_offline):
    import httpx as _httpx
    from httpx import ASGITransport
    from agents.agt07_review.main import app

    payload = {"reviews": []}
    async with _httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/offline/user_abc/sync", json=payload, headers=auth_header("someone-else"))

    assert resp.status_code == 403


async def test_offline_sync_endpoint_rejects_invalid_quality(mock_db_offline):
    """Pydantic rejects reviews missing required fields — returns 422."""
    import httpx as _httpx
    from httpx import ASGITransport
    from agents.agt07_review.main import app

    payload = {"reviews": [{"review_id": "r-bad"}]}  # missing item_id and quality
    async with _httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/offline/user_abc/sync", json=payload, headers=auth_header("user_abc"))

    assert resp.status_code == 422

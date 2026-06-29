"""
Tests for AGT-07 rate_item — SM-2 state update and DB write.

DB calls (fetchrow/execute) are mocked — these are unit tests that verify
the logic layer without requiring a live Postgres connection.
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock


@pytest.fixture
def mock_db(monkeypatch):
    """Return a dict tracking DB calls so we can assert on them."""
    calls = {"fetchrow": None, "execute": None}

    async def fake_fetchrow(query, *args):
        calls["fetchrow"] = args
        return {"sm_stability": 2.0}

    async def fake_execute(query, *args):
        calls["execute"] = args
        return "UPDATE 1"

    monkeypatch.setattr("agents.agt07_review.service.fetchrow", fake_fetchrow)
    monkeypatch.setattr("agents.agt07_review.service.execute", fake_execute)
    return calls


async def test_rate_item_returns_item_id(mock_db):
    from agents.agt07_review.service import rate_item

    result = await rate_item("user-1", "item-uuid-1", quality=4)
    assert result["item_id"] == "item-uuid-1"


async def test_rate_item_returns_quality(mock_db):
    from agents.agt07_review.service import rate_item

    result = await rate_item("user-1", "item-uuid-1", quality=3)
    assert result["quality"] == 3


async def test_rate_item_returns_next_review_iso_string(mock_db):
    from agents.agt07_review.service import rate_item

    result = await rate_item("user-1", "item-uuid-1", quality=4)
    # Must be parseable as an ISO datetime
    dt = datetime.fromisoformat(result["next_review"].replace("Z", "+00:00"))
    assert dt > datetime.now(timezone.utc)


async def test_rate_item_writes_to_db(mock_db):
    from agents.agt07_review.service import rate_item

    await rate_item("user-1", "item-uuid-1", quality=4)
    assert mock_db["execute"] is not None, "execute was never called"
    # execute args: (new_stability, next_review, item_id, clerk_user_id)
    assert mock_db["execute"][2] == "item-uuid-1"
    assert mock_db["execute"][3] == "user-1"


async def test_rate_item_quality_0_gives_1_day_review(mock_db):
    from agents.agt07_review.service import rate_item
    from datetime import timedelta

    result = await rate_item("user-1", "item-uuid-1", quality=0)
    next_review = datetime.fromisoformat(result["next_review"].replace("Z", "+00:00"))
    days_until = (next_review - datetime.now(timezone.utc)).days
    assert days_until <= 1


async def test_rate_item_quality_5_gives_longer_review(mock_db):
    from agents.agt07_review.service import rate_item

    result = await rate_item("user-1", "item-uuid-1", quality=5)
    next_review = datetime.fromisoformat(result["next_review"].replace("Z", "+00:00"))
    days_until = (next_review - datetime.now(timezone.utc)).days
    assert days_until >= 10


async def test_rate_item_reads_stability_from_db(mock_db):
    from agents.agt07_review.service import rate_item

    await rate_item("user-1", "item-uuid-1", quality=4)
    assert mock_db["fetchrow"] is not None, "fetchrow was never called"
    # fetchrow args: (item_id, clerk_user_id)
    assert "item-uuid-1" in mock_db["fetchrow"]
    assert "user-1" in mock_db["fetchrow"]


async def test_rate_item_raises_value_error_when_no_row(monkeypatch):
    """When DB has no row, ValueError is raised (item not found)."""
    monkeypatch.setattr("agents.agt07_review.service.fetchrow", AsyncMock(return_value=None))
    monkeypatch.setattr("agents.agt07_review.service.execute", AsyncMock(return_value="UPDATE 0"))

    from agents.agt07_review.service import rate_item

    with pytest.raises(ValueError):
        await rate_item("user-1", "unknown-item", quality=4)

"""
Tests for AGT-08 run_analysis — specifically the days_since computation.
"""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock


def _make_session(days_ago: int) -> dict:
    dt = datetime.now(timezone.utc) - timedelta(days=days_ago)
    return {"start_time": dt.isoformat()}


def _make_http_client_mock(sessions: list[dict], monkeypatch):
    """
    Build a mock AsyncClient whose .get() returns sync-callable .json() mocks.
    httpx.Response.json() is a regular (sync) method, so we use MagicMock for resp,
    not AsyncMock — otherwise resp.json() yields a coroutine, not a list.
    """
    def make_resp(data):
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json.return_value = data
        return resp

    async def mock_get(url, **kwargs):
        if "/errors" in url:
            return make_resp([])
        if "/sessions" in url:
            return make_resp(sessions)
        if "/profile" in url:
            return make_resp({"behavioral_profile": {}})
        return make_resp({})

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = mock_get

    monkeypatch.setattr("agents.agt08_analysis.service.httpx.AsyncClient", lambda **kw: mock_client)
    monkeypatch.setattr("agents.agt08_analysis.service.emit", AsyncMock())
    return mock_client


async def test_risk_score_above_threshold_when_session_8_days_ago(monkeypatch):
    _make_http_client_mock([_make_session(8)], monkeypatch)

    from agents.agt08_analysis.service import run_analysis

    result = await run_analysis("user-001")
    assert result["risk_score"] > 0.7, (
        f"Expected risk_score > 0.7 for 8-day absence, got {result['risk_score']}"
    )


async def test_days_since_zero_when_session_today(monkeypatch):
    _make_http_client_mock([_make_session(0)], monkeypatch)

    from agents.agt08_analysis.service import run_analysis

    result = await run_analysis("user-002")
    assert result["risk_score"] < 0.7


async def test_empty_sessions_does_not_crash(monkeypatch):
    _make_http_client_mock([], monkeypatch)

    from agents.agt08_analysis.service import run_analysis

    result = await run_analysis("user-003")
    assert "risk_score" in result

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


async def test_risk_score_above_threshold_for_long_absence_with_declining_engagement(monkeypatch):
    """
    The risk model's days-absent signal now saturates at 14 days (not 7) as
    part of the multi-signal weighted score in risk_model.py — see that
    module's docstring for the full rationale. Days-absence alone caps its
    contribution at exactly 0.7 (the alert threshold itself), so it can never
    strictly exceed 0.7 without at least some trend signal too. A user who is
    both long-absent AND has widening session gaps (declining engagement
    frequency leading up to that absence) realistically crosses the
    threshold and should trigger the AGT-10 behavioral_risk_event alert
    (service.py's `if risk > 0.7` check).
    """
    sessions = [
        _make_session(60), _make_session(58), _make_session(56),  # old: every 2 days
        _make_session(40), _make_session(30), _make_session(20),  # recent: widening gaps
    ]
    _make_http_client_mock(sessions, monkeypatch)

    from agents.agt08_analysis.service import run_analysis

    result = await run_analysis("user-001")
    assert result["risk_score"] > 0.7, (
        f"Expected risk_score > 0.7 for long absence + declining engagement, got {result['risk_score']}"
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


async def test_plateau_reaches_real_detection_when_5_or_more_sessions(monkeypatch):
    """
    With >= 5 sessions, plateau detection must reach changepoint.py's real
    PELT-based branch — NOT return insufficient_data:True.
    This test FAILS before the fix because theta_series is hardcoded to [].

    Updated for Task C3 (real ruptures PELT implementation replacing the
    always-plateau:False stub): the stub-era "stub":True marker no longer
    exists, so this now asserts on the "changepoints" key that the real
    implementation always includes once it reaches that branch.
    """
    sessions = [_make_session(i * 3) for i in range(6)]  # 6 sessions, every 3 days
    _make_http_client_mock(sessions, monkeypatch)

    from agents.agt08_analysis.service import run_analysis
    result = await run_analysis("user-plateau-fix")

    assert result["plateau"].get("insufficient_data") is not True, (
        "Expected plateau to reach real detection branch for 6 sessions, "
        f"but got insufficient_data=True. Full result: {result}"
    )
    assert "changepoints" in result["plateau"]

"""
Tests for AGT-08 run_analysis — specifically the days_since computation.
"""

import httpx
import pytest
import fakeredis.aioredis
import json
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch):
    import agents.agt08_analysis.service as svc
    store = fakeredis.aioredis.FakeRedis()

    async def _get_redis():
        return store

    monkeypatch.setattr(svc, "get_redis", _get_redis)
    return store


def _make_session(days_ago: int) -> dict:
    dt = datetime.now(timezone.utc) - timedelta(days=days_ago)
    return {"start_time": dt.isoformat()}


def _make_http_client_mock(sessions: list[dict], monkeypatch, assessment_history: dict[str, list[dict]] | None = None):
    """
    Build a mock AsyncClient whose .get() returns sync-callable .json() mocks.
    httpx.Response.json() is a regular (sync) method, so we use MagicMock for resp,
    not AsyncMock — otherwise resp.json() yields a coroutine, not a list.

    Also mocks the GET /ltm/{user}/assessment-history?skill_domain= calls used
    for real per-skill theta history. assessment_history maps
    skill_domain -> list of {irt_score, assessed_at}; defaults to empty
    history per skill when omitted.
    """
    assessment_history = assessment_history or {}

    def make_resp(data):
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json.return_value = data
        return resp

    async def mock_get(url, **kwargs):
        if "/assessment-history" in url:
            params = kwargs.get("params", {})
            skill = params.get("skill_domain", "")
            return make_resp(assessment_history.get(skill, []))
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
    With >= 5 real theta history points for a skill, plateau detection must
    reach changepoint.py's real PELT-based branch — NOT return
    insufficient_data:True.

    Updated for Task C5 (per-skill plateau_by_skill replacing the singular
    made-up-series plateau field): theta history is now fetched per skill
    domain from AGT-06's assessment-history endpoint, not proxied from
    session count. We seed READING with 6 flat theta values and assert on
    plateau_by_skill["READING"].
    """
    sessions = [_make_session(i * 3) for i in range(6)]  # 6 sessions, every 3 days
    history = {
        "READING": [{"irt_score": 1.0, "assessed_at": f"2026-06-{i:02d}T00:00:00+00:00"} for i in range(1, 7)],
    }
    _make_http_client_mock(sessions, monkeypatch, assessment_history=history)

    from agents.agt08_analysis.service import run_analysis
    result = await run_analysis("user-plateau-fix")

    assert result["plateau_by_skill"]["READING"].get("insufficient_data") is not True, (
        "Expected plateau to reach real detection branch for 6 theta points, "
        f"but got insufficient_data=True. Full result: {result}"
    )
    assert "changepoints" in result["plateau_by_skill"]["READING"]


async def test_run_analysis_returns_plateau_by_skill_not_singular_plateau(monkeypatch):
    _make_http_client_mock([_make_session(1)], monkeypatch)

    from agents.agt08_analysis.service import run_analysis
    result = await run_analysis("user-multi-skill")

    assert "plateau_by_skill" in result
    assert "plateau" not in result
    assert set(result["plateau_by_skill"].keys()) == {"LISTENING", "READING", "WRITING"}


async def test_run_analysis_uses_real_theta_history_per_skill(monkeypatch):
    """READING has 6 flat theta values (a real plateau); LISTENING and WRITING
    have no history at all. The per-skill results must differ accordingly —
    this is the regression test proving theta_series is no longer a
    same-for-every-skill proxy."""
    history = {
        "READING": [{"irt_score": 1.0, "assessed_at": f"2026-06-{i:02d}T00:00:00+00:00"} for i in range(1, 7)],
        "LISTENING": [],
        "WRITING": [],
    }
    _make_http_client_mock([_make_session(1)], monkeypatch, assessment_history=history)

    from agents.agt08_analysis.service import run_analysis
    result = await run_analysis("user-reading-plateau")

    assert result["plateau_by_skill"]["READING"]["insufficient_data"] is False
    assert result["plateau_by_skill"]["READING"]["plateau"] is True
    assert result["plateau_by_skill"]["LISTENING"]["insufficient_data"] is True
    assert result["plateau_by_skill"]["WRITING"]["insufficient_data"] is True


async def test_run_analysis_isolates_single_skill_theta_history_fetch_failure(monkeypatch):
    """
    Task C5 regression: _fetch_theta_history wraps its HTTP call in its own
    try/except and returns [] on failure, so that if ONE skill's
    assessment-history fetch blows up (AGT-06 hiccup, timeout, etc.) the
    other two skills' plateau detection still completes normally instead of
    aborting the whole analysis. Here WRITING's fetch raises; LISTENING and
    READING succeed with real flat theta series (a genuine plateau).
    """
    sessions = [_make_session(1)]
    good_history = [
        {"irt_score": 1.0, "assessed_at": f"2026-06-{i:02d}T00:00:00+00:00"} for i in range(1, 7)
    ]

    def make_resp(data):
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json.return_value = data
        return resp

    async def mock_get(url, **kwargs):
        if "/assessment-history" in url:
            params = kwargs.get("params", {})
            skill = params.get("skill_domain", "")
            if skill == "WRITING":
                raise httpx.ConnectTimeout("simulated AGT-06 timeout for WRITING")
            return make_resp(good_history)
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

    from agents.agt08_analysis.service import run_analysis

    # Must not raise/propagate the simulated WRITING fetch failure.
    result = await run_analysis("user-partial-failure")

    # The failed skill degrades gracefully to the empty-history shape.
    assert result["plateau_by_skill"]["WRITING"] == {"plateau": False, "insufficient_data": True}

    # The other two skills are computed normally from their real mocked data,
    # not also degraded by WRITING's failure.
    assert result["plateau_by_skill"]["LISTENING"]["insufficient_data"] is False
    assert result["plateau_by_skill"]["LISTENING"]["plateau"] is True
    assert result["plateau_by_skill"]["READING"]["insufficient_data"] is False
    assert result["plateau_by_skill"]["READING"]["plateau"] is True


async def test_run_analysis_passes_sessions_to_risk_model(monkeypatch):
    """compute_risk_score must now receive the real sessions list, not just
    days_since_last_session — this is the regression test for Task C4's wiring."""
    sessions = [_make_session(i) for i in [0, 1, 2, 10, 15, 20]]  # widening gaps
    _make_http_client_mock(sessions, monkeypatch)

    captured_calls = []
    import agents.agt08_analysis.service as svc
    original = svc.compute_risk_score

    def capturing_risk_score(*args, **kwargs):
        captured_calls.append((args, kwargs))
        return original(*args, **kwargs)

    monkeypatch.setattr(svc, "compute_risk_score", capturing_risk_score)

    await svc.run_analysis("user-risk-check")

    assert len(captured_calls) == 1
    args, kwargs = captured_calls[0]
    passed_sessions = kwargs.get("sessions") if "sessions" in kwargs else (args[2] if len(args) > 2 else None)
    assert passed_sessions == sessions, "sessions list must be forwarded to compute_risk_score unchanged"


async def test_run_analysis_persists_successful_result_to_redis(monkeypatch, fake_redis):
    """Task: AGT-08 persistence fix. A successful run_analysis() must write
    its result to Redis under agt08:latest:{clerk_user_id} so GET /latest
    has something to read."""
    _make_http_client_mock([_make_session(1)], monkeypatch)

    from agents.agt08_analysis.service import run_analysis
    result = await run_analysis("user-persist")

    cached = await fake_redis.get("agt08:latest:user-persist")
    assert cached is not None
    assert json.loads(cached) == result


async def test_run_analysis_does_not_persist_on_upstream_fetch_failure(monkeypatch, fake_redis):
    """Regression guard: a transient AGT-06/AGT-01 fetch failure must NOT
    overwrite the last known good analysis in Redis with the error stub —
    this is a 'last known analysis' cache, not a recompute-on-every-call
    cache, so a bad run must be a no-op for persistence."""
    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(side_effect=RuntimeError("AGT-06 unreachable"))
    mock_client.__aexit__ = AsyncMock(return_value=False)

    import agents.agt08_analysis.service as svc
    monkeypatch.setattr(svc.httpx, "AsyncClient", lambda **kw: mock_client)

    result = await svc.run_analysis("user-fetch-fail")

    assert "error" in result
    cached = await fake_redis.get("agt08:latest:user-fetch-fail")
    assert cached is None


async def test_run_analysis_does_not_raise_when_redis_persist_fails(monkeypatch, fake_redis):
    """Regression: a Redis outage during persistence must not turn a
    successful analysis into an apparent failure for the caller — only
    the cache write is best-effort, the analysis result itself is real."""
    _make_http_client_mock([_make_session(1)], monkeypatch)

    async def _broken_set(*args, **kwargs):
        raise ConnectionError("simulated Redis outage")

    monkeypatch.setattr(fake_redis, "set", _broken_set)

    from agents.agt08_analysis.service import run_analysis
    result = await run_analysis("user-redis-down")

    assert "error" not in result
    assert "risk_score" in result

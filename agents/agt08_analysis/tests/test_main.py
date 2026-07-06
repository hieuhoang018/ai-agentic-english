"""
Tests for AGT-08 HTTP endpoints (main.py): auth enforcement and Redis-backed
persistence on GET /analysis/{clerk_user_id}/latest.
"""

import fakeredis.aioredis
import pytest
from fastapi.testclient import TestClient

import agents.agt08_analysis.service as svc
from agents.agt08_analysis.main import app
from agents.shared.testing import auth_header

client = TestClient(app)

USER = "user_x"


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch):
    store = fakeredis.aioredis.FakeRedis()

    async def _get_redis():
        return store

    monkeypatch.setattr(svc, "get_redis", _get_redis)
    return store


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["agent"] == "AGT-08"
    assert data["status"] == "ok"


def test_latest_endpoint_requires_bearer_token():
    resp = client.get(f"/analysis/{USER}/latest")
    assert resp.status_code == 401


def test_latest_endpoint_rejects_mismatched_user():
    resp = client.get(f"/analysis/{USER}/latest", headers=auth_header("someone-else"))
    assert resp.status_code == 403


def test_latest_endpoint_returns_insufficient_data_when_never_analyzed():
    resp = client.get(f"/analysis/{USER}/latest", headers=auth_header(USER))

    assert resp.status_code == 200
    assert resp.json() == {
        "clerk_user_id": USER,
        "patterns": [],
        "plateau_by_skill": {},
        "risk_score": None,
        "insufficient_data": True,
    }


def test_latest_endpoint_returns_cached_analysis(monkeypatch):
    """
    Deliberately mocks service.get_latest_analysis rather than seeding
    fakeredis directly: test_service.py already covers the Redis read path
    exhaustively (hit/miss), so this test only needs to prove the HTTP layer
    forwards the service's result unchanged. Seeding fakeredis here would
    also require awaiting inside the test body while TestClient runs its own
    event loop internally — mocking the already-imported name in main.py
    avoids that entirely and matches this codebase's existing test_main.py
    convention (see agt09_recommendation/tests/test_main.py) of keeping test
    functions synchronous and only using async closures, never awaited
    directly by the test.
    """
    cached_result = {
        "clerk_user_id": USER,
        "patterns": [{"type": "persistent_weakness", "skill": "READING"}],
        "plateau_by_skill": {"READING": {"plateau": True, "insufficient_data": False, "changepoints": []}},
        "risk_score": 0.42,
        "insufficient_data": False,
    }

    async def _fake_get_latest_analysis(clerk_user_id):
        return cached_result

    import agents.agt08_analysis.main as main_module
    monkeypatch.setattr(main_module, "get_latest_analysis", _fake_get_latest_analysis)

    resp = client.get(f"/analysis/{USER}/latest", headers=auth_header(USER))

    assert resp.status_code == 200
    assert resp.json() == cached_result

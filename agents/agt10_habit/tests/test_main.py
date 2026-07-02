"""
Tests for AGT-10 HTTP endpoints (main.py): auth enforcement on
/library/{clerk_user_id} and /streak/{clerk_user_id}, and that /library
forwards the caller's bearer token into the downstream AGT-09 call.
"""

import httpx
import respx
import fakeredis.aioredis
from fastapi.testclient import TestClient

import agents.agt10_habit.service as svc
from agents.agt10_habit.main import app
from agents.agt10_habit.exercise_library import AGT02_BASE, AGT07_BASE, AGT09_BASE, LMS_BASE
from agents.shared.testing import auth_header

client = TestClient(app)

USER = "user_x"
TODAY_URL = f"{AGT02_BASE}/plans/{USER}/today"
DUE_URL = f"{AGT07_BASE}/schedule/{USER}/due"
RECO_URL = f"{AGT09_BASE}/recommendations/{USER}"
BROWSE_URL = f"{LMS_BASE}/modules"


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["agent"] == "AGT-10"
    assert data["status"] == "ok"


def test_library_endpoint_requires_bearer_token():
    resp = client.get(f"/library/{USER}")
    assert resp.status_code == 401


def test_library_endpoint_rejects_mismatched_user():
    resp = client.get(f"/library/{USER}", headers=auth_header("someone-else"))
    assert resp.status_code == 403


@respx.mock
def test_library_endpoint_forwards_bearer_token_downstream():
    reco_route = respx.get(RECO_URL).mock(return_value=httpx.Response(200, json=[]))
    respx.get(TODAY_URL).mock(return_value=httpx.Response(200, json=[]))
    respx.get(DUE_URL).mock(return_value=httpx.Response(200, json=[]))
    respx.get(BROWSE_URL).mock(return_value=httpx.Response(200, json=[]))

    headers = auth_header(USER)
    resp = client.get(f"/library/{USER}", headers=headers)

    assert resp.status_code == 200
    assert reco_route.called
    assert reco_route.calls.last.request.headers["Authorization"] == headers["Authorization"]


def test_streak_endpoint_requires_bearer_token():
    resp = client.get(f"/streak/{USER}")
    assert resp.status_code == 401


def test_streak_endpoint_rejects_mismatched_user():
    resp = client.get(f"/streak/{USER}", headers=auth_header("someone-else"))
    assert resp.status_code == 403


def test_streak_endpoint_returns_current_streak(monkeypatch):
    store = fakeredis.aioredis.FakeRedis()

    async def _get_redis():
        return store

    monkeypatch.setattr(svc, "get_redis", _get_redis)

    resp = client.get(f"/streak/{USER}", headers=auth_header(USER))

    assert resp.status_code == 200
    assert resp.json() == {"clerk_user_id": USER, "streak": 0}

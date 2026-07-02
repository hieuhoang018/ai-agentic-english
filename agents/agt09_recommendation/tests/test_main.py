"""
Tests for AGT-09 HTTP endpoints (main.py), including that the
/recommendations/{clerk_user_id} response is validated against the typed
RecommendationItem schema (models.py) rather than passed through as a raw dict.
"""

import httpx
import respx
import fakeredis.aioredis
from fastapi.testclient import TestClient

import agents.agt09_recommendation.service as svc
from agents.agt09_recommendation.main import app
from agents.shared.testing import auth_header

client = TestClient(app)

AGT01_URL = "http://agt01-profiling:8101"
LMS_URL = "http://learning-materials-service:4002"


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["agent"] == "AGT-09"
    assert data["status"] == "ok"


@respx.mock
def test_recommendations_endpoint_strips_internal_score_field(monkeypatch):
    store = fakeredis.aioredis.FakeRedis()

    async def _get_redis():
        return store

    monkeypatch.setattr(svc, "get_redis", _get_redis)

    respx.get(f"{AGT01_URL}/profile/user-http").mock(
        return_value=httpx.Response(200, json={
            "cold_start_flag": False,
            "irt_theta": {"L": 0.0, "S": 0.0, "R": 0.0, "W": 0.0},
        })
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=[
            {"id": "m1", "title": "Module A", "skillFocus": "READING", "cefrLevel": "B1"},
        ])
    )

    resp = client.get("/recommendations/user-http", headers=auth_header("user-http"))

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == "m1"
    assert "_score" not in data[0]


def test_recommendations_endpoint_requires_bearer_token():
    resp = client.get("/recommendations/user-http")
    assert resp.status_code == 401


def test_recommendations_endpoint_rejects_mismatched_user():
    resp = client.get("/recommendations/user-http", headers=auth_header("someone-else"))
    assert resp.status_code == 403

"""
Tests for AGT-06 HTTP endpoints (main.py): auth enforcement and field
scoping on the frontend-facing GET /summary/{clerk_user_id}.
"""

from fastapi.testclient import TestClient

import agents.agt06_memory.main as main_module
from agents.agt06_memory.main import app
from agents.shared.testing import auth_header

client = TestClient(app)

USER = "user_x"


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["agent"] == "AGT-06"
    assert data["status"] == "ok"


def test_summary_requires_bearer_token():
    resp = client.get(f"/summary/{USER}")
    assert resp.status_code == 401


def test_summary_rejects_mismatched_user():
    resp = client.get(f"/summary/{USER}", headers=auth_header("someone-else"))
    assert resp.status_code == 403


def test_summary_returns_start_and_end_time_only(monkeypatch):
    """
    Regression guard: summary_metrics and other session fields must never
    leak through this route — only start_time/end_time, for the weekly
    activity chart's client-side reduce.
    """
    async def _fake_get_sessions(clerk_user_id, limit=20):
        return [
            {
                "session_id": "s1",
                "clerk_user_id": clerk_user_id,
                "start_time": "2026-07-01T10:00:00+00:00",
                "end_time": "2026-07-01T10:20:00+00:00",
                "skill_focus": "READING",
                "summary_metrics": {"accuracy": 0.9},
            }
        ]

    monkeypatch.setattr(main_module.ltm, "get_sessions", _fake_get_sessions)

    resp = client.get(f"/summary/{USER}", headers=auth_header(USER))

    assert resp.status_code == 200
    assert resp.json() == [
        {"start_time": "2026-07-01T10:00:00+00:00", "end_time": "2026-07-01T10:20:00+00:00"}
    ]


def test_summary_passes_limit_through(monkeypatch):
    captured = {}

    async def _fake_get_sessions(clerk_user_id, limit=20):
        captured["limit"] = limit
        return []

    monkeypatch.setattr(main_module.ltm, "get_sessions", _fake_get_sessions)

    resp = client.get(f"/summary/{USER}?limit=7", headers=auth_header(USER))

    assert resp.status_code == 200
    assert captured["limit"] == 7

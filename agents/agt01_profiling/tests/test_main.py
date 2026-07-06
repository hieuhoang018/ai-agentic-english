"""
Tests for AGT-01 HTTP endpoints (main.py): auth enforcement and field
scoping on the frontend-facing GET /summary/{clerk_user_id}.
"""

from fastapi.testclient import TestClient

import agents.agt01_profiling.main as main_module
from agents.agt01_profiling.main import app
from agents.shared.testing import auth_header

client = TestClient(app)

USER = "user_x"


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["agent"] == "AGT-01"
    assert data["status"] == "ok"


def test_summary_requires_bearer_token():
    resp = client.get(f"/summary/{USER}")
    assert resp.status_code == 401


def test_summary_rejects_mismatched_user():
    resp = client.get(f"/summary/{USER}", headers=auth_header("someone-else"))
    assert resp.status_code == 403


def test_summary_returns_theta_cold_start_and_goals_only(monkeypatch):
    """
    Regression guard: the full profile (grammar_error_map, vocabulary_beta)
    must never leak through this route — only theta/cold-start/goals.
    """
    async def _fake_get_profile(clerk_user_id, session_id=None):
        return {
            "clerk_user_id": clerk_user_id,
            "irt_theta": {"L": 0.5, "S": None, "R": 1.2, "W": -0.3},
            "cold_start_flag": False,
            "goal_profile": {"currentLevel": "B1", "goals": ["Interview prep"]},
            "grammar_error_map": {"READING": {"article_error": 3.0}},
            "vocabulary_beta": {"apple": {"beta": 0.1}},
        }

    monkeypatch.setattr(main_module, "get_profile", _fake_get_profile)

    resp = client.get(f"/summary/{USER}", headers=auth_header(USER))

    assert resp.status_code == 200
    assert resp.json() == {
        "clerk_user_id": USER,
        "irt_theta": {"L": 0.5, "S": None, "R": 1.2, "W": -0.3},
        "cold_start_flag": False,
        "goal_profile": {"currentLevel": "B1", "goals": ["Interview prep"]},
    }


def test_summary_defaults_when_profile_fields_missing(monkeypatch):
    async def _fake_get_profile(clerk_user_id, session_id=None):
        return {"clerk_user_id": clerk_user_id}

    monkeypatch.setattr(main_module, "get_profile", _fake_get_profile)

    resp = client.get(f"/summary/{USER}", headers=auth_header(USER))

    assert resp.status_code == 200
    assert resp.json() == {
        "clerk_user_id": USER,
        "irt_theta": {},
        "cold_start_flag": True,
        "goal_profile": {},
    }

"""
Tests for AGT-02 HTTP endpoints (main.py).

Before this file, main.py had 0% test coverage (confirmed via
`pytest --cov`) -- none of the 4 /plans/* routes had a single test, and the
internal-secret auth gate added to those routes was unverified end-to-end.
These tests exercise the FastAPI layer directly (routing, auth dependency,
status codes, request validation), with service.py's functions mocked --
service.py's own behavior is covered exhaustively in test_service.py.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from agents.agt02_learning_path import service
from agents.agt02_learning_path.main import app
from agents.shared.config import settings
from agents.shared.testing import auth_header

client = TestClient(app)

AUTH_HEADERS = {"x-internal-secret": settings.INTERNAL_SECRET}


def test_health_requires_no_auth():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "agent": "AGT-02", "name": "Learning Path"}


# --- Auth gate: every /plans/* route must reject a missing or wrong secret ---


def test_generate_plan_rejects_missing_internal_secret(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr(service, "generate_plan", mock)

    resp = client.post("/plans/user1/generate", json={"daily_minutes": 30, "goals": []})

    assert resp.status_code == 403
    mock.assert_not_called()


def test_generate_plan_rejects_wrong_internal_secret(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr(service, "generate_plan", mock)

    resp = client.post(
        "/plans/user1/generate",
        json={"daily_minutes": 30, "goals": []},
        headers={"x-internal-secret": "wrong-secret"},
    )

    assert resp.status_code == 403
    mock.assert_not_called()


def test_replan_rejects_missing_internal_secret(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr(service, "generate_plan", mock)

    resp = client.post("/plans/user1/replan", json={"daily_minutes": 30, "goals": []})

    assert resp.status_code == 403
    mock.assert_not_called()


def test_active_plan_rejects_missing_internal_secret(monkeypatch):
    mock = AsyncMock(return_value={"plan_id": "p1"})
    monkeypatch.setattr(service, "get_active_plan", mock)

    resp = client.get("/plans/user1/active")

    assert resp.status_code == 403
    mock.assert_not_called()


def test_today_plan_rejects_missing_internal_secret(monkeypatch):
    mock = AsyncMock(return_value={"activities": []})
    monkeypatch.setattr(service, "get_today_plan", mock)

    resp = client.get("/plans/user1/today")

    assert resp.status_code == 403
    mock.assert_not_called()


# --- Happy paths with the correct secret ---


def test_generate_plan_accepts_correct_secret_and_delegates_to_service(monkeypatch):
    mock = AsyncMock(return_value={"plan_id": "p1", "version": 1})
    monkeypatch.setattr(service, "generate_plan", mock)

    resp = client.post(
        "/plans/user1/generate",
        json={"daily_minutes": 30, "goals": ["business"]},
        headers=AUTH_HEADERS,
    )

    assert resp.status_code == 200
    assert resp.json() == {"plan_id": "p1", "version": 1}
    mock.assert_awaited_once_with(
        "user1", {"skill_estimates": None, "daily_minutes": 30, "goals": ["business"]}
    )


def test_replan_accepts_correct_secret_and_delegates_to_service(monkeypatch):
    mock = AsyncMock(return_value={"plan_id": "p2", "version": 2})
    monkeypatch.setattr(service, "generate_plan", mock)

    resp = client.post(
        "/plans/user1/replan",
        json={"daily_minutes": 45, "goals": []},
        headers=AUTH_HEADERS,
    )

    assert resp.status_code == 200
    assert resp.json()["plan_id"] == "p2"
    mock.assert_awaited_once_with(
        "user1", {"skill_estimates": None, "daily_minutes": 45, "goals": []}
    )


def test_active_plan_returns_404_when_none_exists(monkeypatch):
    monkeypatch.setattr(service, "get_active_plan", AsyncMock(return_value=None))

    resp = client.get("/plans/user1/active", headers=AUTH_HEADERS)

    assert resp.status_code == 404


def test_active_plan_returns_plan_when_present(monkeypatch):
    monkeypatch.setattr(service, "get_active_plan", AsyncMock(return_value={"plan_id": "p1"}))

    resp = client.get("/plans/user1/active", headers=AUTH_HEADERS)

    assert resp.status_code == 200
    assert resp.json() == {"plan_id": "p1"}


def test_today_plan_accepts_correct_secret_and_returns_result(monkeypatch):
    monkeypatch.setattr(
        service, "get_today_plan", AsyncMock(return_value={"clerk_user_id": "user1", "activities": []})
    )

    resp = client.get("/plans/user1/today", headers=AUTH_HEADERS)

    assert resp.status_code == 200
    assert resp.json()["clerk_user_id"] == "user1"


# --- Request validation (models.GeneratePlanRequest bounds) ---


def test_generate_plan_rejects_negative_daily_minutes(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr(service, "generate_plan", mock)

    resp = client.post(
        "/plans/user1/generate",
        json={"daily_minutes": -5, "goals": []},
        headers=AUTH_HEADERS,
    )

    assert resp.status_code == 422
    mock.assert_not_called()


def test_generate_plan_rejects_absurdly_large_daily_minutes(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr(service, "generate_plan", mock)

    resp = client.post(
        "/plans/user1/generate",
        json={"daily_minutes": 999999, "goals": []},
        headers=AUTH_HEADERS,
    )

    assert resp.status_code == 422
    mock.assert_not_called()


def test_generate_plan_rejects_zero_daily_minutes(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr(service, "generate_plan", mock)

    resp = client.post(
        "/plans/user1/generate",
        json={"daily_minutes": 0, "goals": []},
        headers=AUTH_HEADERS,
    )

    assert resp.status_code == 422
    mock.assert_not_called()


def test_generate_plan_accepts_boundary_values(monkeypatch):
    mock = AsyncMock(return_value={"plan_id": "p1"})
    monkeypatch.setattr(service, "generate_plan", mock)

    resp_low = client.post(
        "/plans/user1/generate", json={"daily_minutes": 5, "goals": []}, headers=AUTH_HEADERS
    )
    resp_high = client.post(
        "/plans/user1/generate", json={"daily_minutes": 180, "goals": []}, headers=AUTH_HEADERS
    )

    assert resp_low.status_code == 200
    assert resp_high.status_code == 200


# --- POST /replan/{clerk_user_id}: user-facing, JWT-scoped ---


def test_replan_for_user_requires_bearer_token(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr(service, "generate_plan", mock)

    resp = client.post("/replan/user1", json={"daily_minutes": 30, "goals": []})

    assert resp.status_code == 401
    mock.assert_not_called()


def test_replan_for_user_rejects_mismatched_user(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr(service, "generate_plan", mock)

    resp = client.post(
        "/replan/user1",
        json={"daily_minutes": 30, "goals": []},
        headers=auth_header("someone-else"),
    )

    assert resp.status_code == 403
    mock.assert_not_called()


def test_replan_for_user_accepts_matching_user_and_delegates_to_service(monkeypatch):
    mock = AsyncMock(return_value={"plan_id": "p3", "version": 3})
    monkeypatch.setattr(service, "generate_plan", mock)

    resp = client.post(
        "/replan/user1",
        json={"daily_minutes": 45, "goals": []},
        headers=auth_header("user1"),
    )

    assert resp.status_code == 200
    assert resp.json()["plan_id"] == "p3"
    mock.assert_awaited_once_with(
        "user1", {"skill_estimates": None, "daily_minutes": 45, "goals": []}
    )

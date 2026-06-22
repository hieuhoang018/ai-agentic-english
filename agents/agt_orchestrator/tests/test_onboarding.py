from unittest.mock import AsyncMock, call
import pytest
import respx
import httpx
from httpx import AsyncClient, ASGITransport

from agents.agt_orchestrator.main import app

PLAN_STUB = {
    "plan_id": "plan-uuid-123",
    "clerk_user_id": "user_test",
    "lm_plan_id": "lm-stub",
    "version": 1,
    "skill_allocation": {"L": 0.3, "S": 0.3, "R": 0.2, "W": 0.2},
    "activities": [
        {
            "activity_id": "act-1",
            "skill_domain": "LISTENING",
            "activity_type": "listen_repeat",
            "title": "Shadowing exercise",
            "estimated_minutes": 10,
            "difficulty": "A1",
            "completed": False,
        }
    ],
    "rationale": "Focus on listening first.",
    "is_active": True,
    "created_at": "2026-06-22T10:30:00+00:00",
}


@pytest.fixture(autouse=True)
def mock_producer_lifecycle(monkeypatch):
    monkeypatch.setattr("agents.agt_orchestrator.main.get_producer", AsyncMock())
    monkeypatch.setattr("agents.agt_orchestrator.main.close_producer", AsyncMock())


@respx.mock
async def test_onboarding_happy_path(monkeypatch):
    mock_emit_ts = AsyncMock()
    monkeypatch.setattr("agents.agt_orchestrator.main.emit_ts_event", mock_emit_ts)

    respx.post("http://agt01-profiling:8101/profile/user_test").mock(
        return_value=httpx.Response(201, json={"clerk_user_id": "user_test"})
    )
    respx.post("http://agt02-learning-path:8102/plans/user_test/generate").mock(
        return_value=httpx.Response(201, json=PLAN_STUB)
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/onboarding",
            json={"userId": "user_test", "currentLevel": "B1", "dailyTimeBudgetMinutes": 20, "goals": ["speaking"]},
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["id"] == "plan-uuid-123"
    assert body["userId"] == "user_test"
    assert "pathDefinition" in body
    assert body["pathDefinition"]["activities"] == PLAN_STUB["activities"]
    assert "createdAt" in body

    mock_emit_ts.assert_awaited_once_with(
        "learning-path.ready",
        "learning-path.ready",
        {"userId": "user_test", "pathId": "plan-uuid-123"},
        key="user_test",
    )


@respx.mock
async def test_onboarding_agt01_fails(monkeypatch):
    monkeypatch.setattr("agents.agt_orchestrator.main.emit_ts_event", AsyncMock())

    respx.post("http://agt01-profiling:8101/profile/user_test").mock(
        return_value=httpx.Response(500, json={"detail": "internal error"})
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/onboarding",
            json={"userId": "user_test"},
        )

    assert resp.status_code == 502
    assert "AGT-01" in resp.json()["detail"]


@respx.mock
async def test_onboarding_agt02_fails(monkeypatch):
    monkeypatch.setattr("agents.agt_orchestrator.main.emit_ts_event", AsyncMock())

    respx.post("http://agt01-profiling:8101/profile/user_test").mock(
        return_value=httpx.Response(201, json={"clerk_user_id": "user_test"})
    )
    respx.post("http://agt02-learning-path:8102/plans/user_test/generate").mock(
        return_value=httpx.Response(500, json={"detail": "plan gen failed"})
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/onboarding",
            json={"userId": "user_test"},
        )

    assert resp.status_code == 502
    assert "AGT-02" in resp.json()["detail"]


@respx.mock
async def test_onboarding_kafka_nonfatal(monkeypatch):
    """Kafka emit failure must NOT prevent the 201 response."""
    mock_emit_ts = AsyncMock(side_effect=Exception("Kafka broker down"))
    monkeypatch.setattr("agents.agt_orchestrator.main.emit_ts_event", mock_emit_ts)

    respx.post("http://agt01-profiling:8101/profile/user_test").mock(
        return_value=httpx.Response(201, json={"clerk_user_id": "user_test"})
    )
    respx.post("http://agt02-learning-path:8102/plans/user_test/generate").mock(
        return_value=httpx.Response(201, json=PLAN_STUB)
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/onboarding",
            json={"userId": "user_test"},
        )

    assert resp.status_code == 201
    assert resp.json()["id"] == "plan-uuid-123"


async def test_onboarding_missing_userid():
    """Missing required field userId must return 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/onboarding",
            json={"currentLevel": "B1"},
        )
    assert resp.status_code == 422

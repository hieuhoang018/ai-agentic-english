from __future__ import annotations

import uuid

import httpx
import pytest
import respx
import fakeredis.aioredis

from agents.agt02_learning_path import service

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def patch_redis(monkeypatch):
    fake = fakeredis.aioredis.FakeRedis()

    async def fake_get_redis():
        return fake

    monkeypatch.setattr(service, "get_redis", fake_get_redis)
    return fake


@respx.mock
async def test_generate_plan_creates_active_plan_with_activities(monkeypatch):
    clerk_id = f"test-user-{uuid.uuid4()}"

    respx.get(f"{service.AGT01_BASE_URL}/profile/{clerk_id}").mock(
        return_value=httpx.Response(200, json={
            "clerk_user_id": clerk_id,
            "irt_theta": {"L": 0.0, "S": -1.0, "R": 0.5, "W": 0.5},
            "cold_start_flag": True,
        })
    )
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog-summary").mock(
        return_value=httpx.Response(404)
    )

    emitted = []

    async def fake_emit(topic, payload, agent_id, key=None):
        emitted.append((topic, payload, agent_id))

    monkeypatch.setattr(service, "emit", fake_emit)

    plan = await service.generate_plan(clerk_id, {"daily_minutes": 60, "goals": ["business calls"]})

    assert plan["clerk_user_id"] == clerk_id
    assert plan["version"] == 1
    assert plan["is_active"] is True
    assert plan["skill_allocation"]["S"] > plan["skill_allocation"]["L"]
    assert len(plan["activities"]) > 0
    assert all("activity_id" in a for a in plan["activities"])
    assert emitted == [("agent.plan.events", {"planId": plan["plan_id"], "clerkUserId": clerk_id, "version": 1}, "AGT02")]


@respx.mock
async def test_generate_plan_twice_deactivates_previous_and_increments_version(monkeypatch):
    clerk_id = f"test-user-{uuid.uuid4()}"

    respx.get(f"{service.AGT01_BASE_URL}/profile/{clerk_id}").mock(
        return_value=httpx.Response(200, json={"clerk_user_id": clerk_id, "irt_theta": {}, "cold_start_flag": True})
    )
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog-summary").mock(
        return_value=httpx.Response(404)
    )

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    first = await service.generate_plan(clerk_id, {"daily_minutes": 30, "goals": []})
    second = await service.generate_plan(clerk_id, {"daily_minutes": 30, "goals": []})

    assert first["version"] == 1
    assert second["version"] == 2

    active = await service.get_active_plan(clerk_id)
    assert active["plan_id"] == second["plan_id"]
    assert active["version"] == 2


@respx.mock
async def test_get_today_plan_returns_empty_for_user_with_no_plan(monkeypatch):
    clerk_id = f"test-user-{uuid.uuid4()}"

    today = await service.get_today_plan(clerk_id)

    assert today == {"clerk_user_id": clerk_id, "plan_id": None, "activities": [], "daily_minutes": 0}


@respx.mock
async def test_generate_plan_falls_back_when_agt01_unreachable(monkeypatch):
    clerk_id = f"test-user-{uuid.uuid4()}"

    respx.get(f"{service.AGT01_BASE_URL}/profile/{clerk_id}").mock(side_effect=httpx.ConnectError("refused"))
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog-summary").mock(side_effect=httpx.ConnectError("refused"))

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    plan = await service.generate_plan(clerk_id, {"daily_minutes": 20, "goals": []})

    # cold-start allocation: all four skills equal
    for skill in ("L", "S", "R", "W"):
        assert abs(plan["skill_allocation"][skill] - 0.25) < 0.02

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch as mock_patch

import httpx
import pytest
import respx
import fakeredis.aioredis

from agents.agt02_learning_path import service

pytestmark = pytest.mark.integration


# In-memory store for mocking database
_db_store = {}


class FakeRecord:
    """Mock asyncpg Record."""

    def __init__(self, data):
        self._data = data

    def __getitem__(self, key):
        return self._data[key]

    def __contains__(self, key):
        return key in self._data

    def get(self, key, default=None):
        return self._data.get(key, default)

    def __iter__(self):
        return iter(self._data)

    def keys(self):
        return self._data.keys()

    def values(self):
        return self._data.values()


class TransactionContext:
    """Mock transaction context."""

    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, exc_type, exc, tb):
        pass


class FakeConnection:
    """Mock asyncpg connection with transaction support."""

    def __init__(self):
        self._in_transaction = False

    async def fetchrow(self, query, *args):
        """Mock fetchrow for database queries."""
        # Handle SELECT for existing active plans
        if "SELECT plan_id, version FROM agent_learning_plans" in query:
            clerk_user_id = args[0]
            for plan in _db_store.get(clerk_user_id, {}).get("plans", []):
                if plan["is_active"]:
                    return FakeRecord(plan)
            return None
        # Handle SELECT * for get_active_plan
        if "SELECT * FROM agent_learning_plans" in query:
            clerk_user_id = args[0]
            for plan in _db_store.get(clerk_user_id, {}).get("plans", []):
                if plan["is_active"]:
                    return FakeRecord(plan)
            return None
        # Handle INSERT... RETURNING *
        if "INSERT INTO agent_learning_plans" in query:
            clerk_user_id = args[0]
            lm_plan_id = args[1]
            version = args[2]
            skill_allocation = args[3]
            activity_queue = args[4]
            rationale = args[5]

            plan = {
                "plan_id": uuid.uuid4(),
                "clerk_user_id": clerk_user_id,
                "lm_plan_id": lm_plan_id,
                "version": version,
                "skill_allocation": skill_allocation,
                "activity_queue": activity_queue,
                "rationale": rationale,
                "is_active": True,
                "created_at": None,
            }

            if clerk_user_id not in _db_store:
                _db_store[clerk_user_id] = {"plans": []}
            _db_store[clerk_user_id]["plans"].append(plan)

            return FakeRecord(plan)
        return None

    async def execute(self, query, *args):
        """Mock execute for UPDATE queries."""
        if "UPDATE agent_learning_plans SET is_active = FALSE" in query:
            plan_id = args[0]
            for clerk_id in _db_store:
                for plan in _db_store[clerk_id].get("plans", []):
                    if plan["plan_id"] == plan_id:
                        plan["is_active"] = False

    def transaction(self):
        return TransactionContext(self)


class PoolAcquireContext:
    """Context manager for pool.acquire()."""

    def __init__(self):
        self.conn = FakeConnection()

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, exc_type, exc, tb):
        pass


class FakePool:
    """Mock asyncpg pool for testing."""

    def acquire(self):
        return PoolAcquireContext()


@pytest.fixture(autouse=True)
def patch_redis(monkeypatch):
    fake = fakeredis.aioredis.FakeRedis()

    async def fake_get_redis():
        return fake

    monkeypatch.setattr(service, "get_redis", fake_get_redis)
    return fake


@pytest.fixture(autouse=True)
def patch_db(monkeypatch):
    """Mock the database pool and fetchrow for tests."""
    _db_store.clear()

    async def fake_get_pool():
        return FakePool()

    async def fake_fetchrow(query, *args):
        """Mock module-level fetchrow used by get_active_plan."""
        # Handle SELECT for get_active_plan
        if "SELECT * FROM agent_learning_plans" in query:
            clerk_user_id = args[0]
            for plan in _db_store.get(clerk_user_id, {}).get("plans", []):
                if plan["is_active"]:
                    return FakeRecord(plan)
            return None
        return None

    monkeypatch.setattr(service, "get_pool", fake_get_pool)
    monkeypatch.setattr(service, "fetchrow", fake_fetchrow)


@pytest.fixture(autouse=True)
def patch_call_llm(monkeypatch):
    async def fake_call_llm(messages, agent_id, **kwargs):
        return "You're on track — keep going!"

    monkeypatch.setattr(service, "call_llm", fake_call_llm)


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
    respx.get(f"{service.LM_SERVICE_BASE_URL}/modules").mock(
        return_value=httpx.Response(404)
    )
    respx.post(f"{service.LM_SERVICE_BASE_URL}/internal/learning-paths").mock(
        return_value=httpx.Response(200)
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
    respx.get(f"{service.LM_SERVICE_BASE_URL}/modules").mock(
        return_value=httpx.Response(404)
    )
    respx.post(f"{service.LM_SERVICE_BASE_URL}/internal/learning-paths").mock(
        return_value=httpx.Response(200)
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
    respx.post(f"{service.LM_SERVICE_BASE_URL}/internal/learning-paths").mock(
        return_value=httpx.Response(200)
    )

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    plan = await service.generate_plan(clerk_id, {"daily_minutes": 20, "goals": []})

    # cold-start allocation: all four skills equal
    for skill in ("L", "S", "R", "W"):
        assert abs(plan["skill_allocation"][skill] - 0.25) < 0.02


@respx.mock
async def test_fetch_catalog_summary_falls_back_to_modules_on_404(monkeypatch, patch_redis):
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog-summary").mock(
        return_value=httpx.Response(404)
    )
    respx.get(f"{service.LM_SERVICE_BASE_URL}/modules").mock(
        return_value=httpx.Response(200, json={"speaking": ["module-1"], "writing": ["module-2"]})
    )

    catalog = await service._fetch_catalog_summary()

    assert catalog == {"speaking": ["module-1"], "writing": ["module-2"]}


@respx.mock
async def test_lm_service_sync_failure_does_not_block_plan_creation(monkeypatch):
    clerk_id = f"test-user-{uuid.uuid4()}"

    respx.get(f"{service.AGT01_BASE_URL}/profile/{clerk_id}").mock(
        return_value=httpx.Response(200, json={"clerk_user_id": clerk_id, "irt_theta": {}, "cold_start_flag": True})
    )
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog-summary").mock(
        return_value=httpx.Response(404)
    )
    respx.get(f"{service.LM_SERVICE_BASE_URL}/modules").mock(return_value=httpx.Response(404))
    # LM service sync is down — must not block plan creation
    respx.post(f"{service.LM_SERVICE_BASE_URL}/internal/learning-paths").mock(
        side_effect=httpx.ConnectError("refused")
    )

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    plan = await service.generate_plan(clerk_id, {"daily_minutes": 20, "goals": []})

    assert plan["is_active"] is True
    assert plan["version"] == 1

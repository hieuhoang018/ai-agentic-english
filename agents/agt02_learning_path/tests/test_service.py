from __future__ import annotations

import asyncio
import json
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

# Simulates Postgres advisory locks: keyed by clerk_user_id (not by
# connection), shared across every FakeConnection instance -- this is what
# lets test_generate_plan_concurrent_calls_for_new_user_... genuinely exercise
# the serialization added to generate_plan's transaction, rather than just
# asserting the lock SQL was issued.
_advisory_locks: dict[str, asyncio.Lock] = {}


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
        # Advisory locks are transaction-scoped in real Postgres (pg_advisory_xact_lock) --
        # release on commit/rollback, mirrored here as "on transaction exit".
        held_key = self.conn._held_lock_key
        if held_key is not None:
            self.conn._held_lock_key = None
            _advisory_locks[held_key].release()


class FakeConnection:
    """Mock asyncpg connection with transaction support."""

    def __init__(self):
        self._in_transaction = False
        self._held_lock_key: str | None = None

    async def fetchrow(self, query, *args):
        """Mock fetchrow for database queries."""
        # A real DB round-trip always yields control back to the event loop at
        # least once. Without this, two coroutines driven via asyncio.gather
        # can run this synchronous-in-substance fake straight through to
        # completion without ever interleaving, masking races that would be
        # real against an actual asyncpg connection (verified: the
        # concurrent-generate-plan test below passed even with the advisory
        # lock removed, until this yield point was added).
        await asyncio.sleep(0)
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
        """Mock execute for advisory-lock and UPDATE queries."""
        if "pg_advisory_xact_lock" in query:
            clerk_user_id = args[0]
            lock = _advisory_locks.setdefault(clerk_user_id, asyncio.Lock())
            await lock.acquire()
            self._held_lock_key = clerk_user_id
            return
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
    _advisory_locks.clear()

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
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog/summary").mock(
        return_value=httpx.Response(200, json={
            "modules": [
                {
                    "id": "mod-speaking-1",
                    "title": "Client calls",
                    "cefrLevel": "B1",
                    "skillFocus": "speaking",
                    "lessonCount": 3,
                    "exerciseCount": 2,
                    "lessons": [{"id": "les-speaking-1", "exerciseIds": ["ex-speaking-1", "ex-speaking-2"]}],
                },
            ],
            "totalModules": 1,
            "totalLessons": 1,
            "totalExercises": 2,
        })
    )
    learning_path_route = respx.post(f"{service.LM_SERVICE_BASE_URL}/internal/learning-paths").mock(
        return_value=httpx.Response(201, json={"id": "lm-path-1"})
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
    assert plan["lm_plan_id"] == "lm-path-1"
    assert learning_path_route.called
    request_body = json.loads(learning_path_route.calls[0].request.content)
    assert request_body["userId"] == clerk_id
    assert request_body["pathDefinition"]["modules"] == [
        {
            "moduleId": "mod-speaking-1",
            "lessons": [{"lessonId": "les-speaking-1", "exerciseIds": ["ex-speaking-1", "ex-speaking-2"]}],
        },
    ]
    assert request_body["pathDefinition"]["activities"] == plan["activities"]
    assert request_body["pathDefinition"] == plan["path_definition"]
    assert any(a.get("module_id") == "mod-speaking-1" for a in plan["activities"])
    assert all("path_module" not in a for a in plan["activities"])
    assert emitted == [("agent.plan.events", {"planId": plan["plan_id"], "clerkUserId": clerk_id, "version": 1}, "AGT02")]


@respx.mock
async def test_generate_plan_twice_deactivates_previous_and_increments_version(monkeypatch):
    clerk_id = f"test-user-{uuid.uuid4()}"

    respx.get(f"{service.AGT01_BASE_URL}/profile/{clerk_id}").mock(
        return_value=httpx.Response(200, json={"clerk_user_id": clerk_id, "irt_theta": {}, "cold_start_flag": True})
    )
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog/summary").mock(
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
async def test_generate_plan_concurrent_calls_for_new_user_do_not_create_duplicate_active_plans(monkeypatch):
    """Regression test for the fixed duplicate-active-plan race condition.

    Two concurrent generate_plan calls for a user with NO existing plan used
    to both see `existing=None` (SELECT ... FOR UPDATE locks nothing when
    there's no row yet) and both insert version=1/is_active=TRUE. The
    per-user pg_advisory_xact_lock added to generate_plan's transaction must
    serialize these calls: one completes and commits before the other's
    SELECT even runs, so the second sees the first's row and becomes
    version=2, leaving exactly one active plan.
    """
    clerk_id = f"test-user-{uuid.uuid4()}"

    respx.get(f"{service.AGT01_BASE_URL}/profile/{clerk_id}").mock(
        return_value=httpx.Response(200, json={"clerk_user_id": clerk_id, "irt_theta": {}, "cold_start_flag": True})
    )
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog/summary").mock(
        return_value=httpx.Response(404)
    )
    respx.post(f"{service.LM_SERVICE_BASE_URL}/internal/learning-paths").mock(
        return_value=httpx.Response(200)
    )

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    plan_a, plan_b = await asyncio.gather(
        service.generate_plan(clerk_id, {"daily_minutes": 20, "goals": []}),
        service.generate_plan(clerk_id, {"daily_minutes": 20, "goals": []}),
    )

    versions = sorted([plan_a["version"], plan_b["version"]])
    assert versions == [1, 2], "concurrent calls for a brand-new user must serialize, not both produce version=1"

    active_plans = [p for p in _db_store[clerk_id]["plans"] if p["is_active"]]
    assert len(active_plans) == 1, "exactly one plan must be active after concurrent generation"


@respx.mock
async def test_get_today_plan_returns_empty_for_user_with_no_plan(monkeypatch):
    clerk_id = f"test-user-{uuid.uuid4()}"

    today = await service.get_today_plan(clerk_id)

    assert today == {"clerk_user_id": clerk_id, "plan_id": None, "activities": [], "daily_minutes": 0}


@respx.mock
async def test_generate_plan_falls_back_when_agt01_unreachable(monkeypatch):
    clerk_id = f"test-user-{uuid.uuid4()}"

    respx.get(f"{service.AGT01_BASE_URL}/profile/{clerk_id}").mock(side_effect=httpx.ConnectError("refused"))
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog/summary").mock(side_effect=httpx.ConnectError("refused"))
    learning_path_route = respx.post(f"{service.LM_SERVICE_BASE_URL}/internal/learning-paths").mock(
        return_value=httpx.Response(200)
    )

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    plan = await service.generate_plan(clerk_id, {"daily_minutes": 20, "goals": []})

    # cold-start allocation: all four skills equal
    for skill in ("L", "S", "R", "W"):
        assert abs(plan["skill_allocation"][skill] - 0.25) < 0.02
    request_body = json.loads(learning_path_route.calls[0].request.content)
    assert request_body["pathDefinition"]["modules"] == []
    assert request_body["pathDefinition"] == plan["path_definition"]
    assert all("path_module" not in a for a in request_body["pathDefinition"]["activities"])


@respx.mock
async def test_fetch_catalog_summary_groups_modules_by_skill_code(monkeypatch, patch_redis):
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog/summary").mock(
        return_value=httpx.Response(200, json={
            "modules": [
                {
                    "id": "m1",
                    "title": "Client calls",
                    "cefrLevel": "B1",
                    "skillFocus": "speaking",
                    "lessonCount": 3,
                    "exerciseCount": 9,
                    "lessons": [{"id": "l1", "exerciseIds": ["e1"]}],
                },
                {
                    "id": "m2",
                    "title": "Follow-up emails",
                    "cefrLevel": "B2",
                    "skillFocus": "writing",
                    "lessonCount": 2,
                    "exerciseCount": 6,
                    "lessons": [{"id": "l2", "exerciseIds": ["e2", "e3"]}],
                },
            ],
            "totalModules": 2,
            "totalLessons": 5,
            "totalExercises": 15,
        })
    )

    catalog = await service._fetch_catalog_summary()

    assert catalog == {
        "S": [
            {
                "module_id": "m1",
                "path_module": {"moduleId": "m1", "lessons": [{"lessonId": "l1", "exerciseIds": ["e1"]}]},
                "activity_type": "speaking_module",
                "title": "Client calls",
                "estimated_minutes": 15,
                "difficulty": "B1",
            },
        ],
        "W": [
            {
                "module_id": "m2",
                "path_module": {"moduleId": "m2", "lessons": [{"lessonId": "l2", "exerciseIds": ["e2", "e3"]}]},
                "activity_type": "writing_module",
                "title": "Follow-up emails",
                "estimated_minutes": 10,
                "difficulty": "B2",
            },
        ],
    }


@respx.mock
async def test_fetch_catalog_summary_falls_back_to_empty_on_404(monkeypatch, patch_redis):
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog/summary").mock(
        return_value=httpx.Response(404)
    )

    catalog = await service._fetch_catalog_summary()

    assert catalog == {}


def test_build_path_definition_collects_unique_modules_and_strips_internal_metadata():
    path_module = {"moduleId": "m1", "lessons": [{"lessonId": "l1", "exerciseIds": ["e1"]}]}
    activities = [
        {
            "activity_id": "a1",
            "module_id": "m1",
            "path_module": path_module,
            "skill_domain": "R",
            "activity_type": "reading_module",
            "title": "Read a project update",
            "estimated_minutes": 10,
            "difficulty": "B1",
            "completed": False,
        },
        {
            "activity_id": "a2",
            "module_id": "m1",
            "path_module": path_module,
            "skill_domain": "R",
            "activity_type": "reading_module",
            "title": "Read another project update",
            "estimated_minutes": 10,
            "difficulty": "B1",
            "completed": False,
        },
        {
            "activity_id": "a3",
            "skill_domain": "W",
            "activity_type": "writing_email",
            "title": "Write a follow-up email",
            "estimated_minutes": 10,
            "difficulty": "B1",
            "completed": False,
        },
    ]

    path_definition = service._build_path_definition(activities)

    assert path_definition["modules"] == [path_module]
    assert [activity.get("module_id") for activity in path_definition["activities"]] == ["m1", "m1", None]
    assert all("path_module" not in activity for activity in path_definition["activities"])


@respx.mock
async def test_lm_service_sync_failure_does_not_block_plan_creation(monkeypatch):
    clerk_id = f"test-user-{uuid.uuid4()}"

    respx.get(f"{service.AGT01_BASE_URL}/profile/{clerk_id}").mock(
        return_value=httpx.Response(200, json={"clerk_user_id": clerk_id, "irt_theta": {}, "cold_start_flag": True})
    )
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog/summary").mock(
        return_value=httpx.Response(404)
    )
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


@respx.mock
async def test_sync_learning_path_500_falls_back_to_uuid(monkeypatch):
    """LMS returns HTTP 500 — plan must still be created with a fallback UUID lm_plan_id."""
    clerk_id = f"test-user-{uuid.uuid4()}"

    respx.get(f"{service.AGT01_BASE_URL}/profile/{clerk_id}").mock(
        return_value=httpx.Response(200, json={"clerk_user_id": clerk_id, "irt_theta": {}, "cold_start_flag": True})
    )
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog/summary").mock(
        return_value=httpx.Response(404)
    )
    respx.post(f"{service.LM_SERVICE_BASE_URL}/internal/learning-paths").mock(
        return_value=httpx.Response(500, json={"error": "internal server error"})
    )

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    plan = await service.generate_plan(clerk_id, {"daily_minutes": 20, "goals": []})

    assert plan["is_active"] is True
    # lm_plan_id must be a non-empty string UUID fallback, not None or empty
    assert isinstance(plan["lm_plan_id"], str)
    assert len(plan["lm_plan_id"]) > 0


@respx.mock
async def test_sync_learning_path_missing_id_field_falls_back_to_uuid(monkeypatch):
    """LMS returns 200 but no 'id' key — plan must still be created with a fallback UUID."""
    clerk_id = f"test-user-{uuid.uuid4()}"

    respx.get(f"{service.AGT01_BASE_URL}/profile/{clerk_id}").mock(
        return_value=httpx.Response(200, json={"clerk_user_id": clerk_id, "irt_theta": {}, "cold_start_flag": True})
    )
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog/summary").mock(
        return_value=httpx.Response(404)
    )
    respx.post(f"{service.LM_SERVICE_BASE_URL}/internal/learning-paths").mock(
        return_value=httpx.Response(201, json={"pathId": "some-other-key"})
    )

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    plan = await service.generate_plan(clerk_id, {"daily_minutes": 20, "goals": []})

    assert plan["is_active"] is True
    assert isinstance(plan["lm_plan_id"], str)
    assert len(plan["lm_plan_id"]) > 0


# --- CEFR-aware selection (_filter_catalog_by_level) ------------------------
# AGT-02 previously ignored profile.goal_profile.currentLevel entirely when
# selecting catalog modules: selection order was pure DB/catalog order, so a
# B2 listening learner could just as easily get an A1 module as a B2 one.
# _filter_catalog_by_level() reorders (and, when needed, restricts) each
# skill's module pool by CEFR proximity to currentLevel before
# optimizer.select_daily_activities() greedily fills the day's budget from it.


def test_filter_catalog_by_level_prefers_at_or_above_closest_first():
    catalog = {
        "L": [
            {"module_id": "c2", "difficulty": "C2"},
            {"module_id": "a1", "difficulty": "A1"},
            {"module_id": "b2", "difficulty": "B2"},
            {"module_id": "c1", "difficulty": "C1"},
        ],
    }

    filtered = service._filter_catalog_by_level(catalog, "B2")

    # A1 (below B2) is dropped; the rest are kept, closest level first.
    assert [item["module_id"] for item in filtered["L"]] == ["b2", "c1", "c2"]


def test_filter_catalog_by_level_falls_back_to_closest_below_when_nothing_meets_level():
    catalog = {
        "R": [
            {"module_id": "a1", "difficulty": "A1"},
            {"module_id": "b1", "difficulty": "B1"},
        ],
    }

    # Learner is C2; no module in this skill meets that level. All modules
    # must be kept (never an empty pool), ordered closest-below-first.
    filtered = service._filter_catalog_by_level(catalog, "C2")

    assert [item["module_id"] for item in filtered["R"]] == ["b1", "a1"]


def test_filter_catalog_by_level_preserves_order_within_same_level():
    catalog = {
        "S": [
            {"module_id": "b2-first", "difficulty": "B2"},
            {"module_id": "b2-second", "difficulty": "B2"},
        ],
    }

    filtered = service._filter_catalog_by_level(catalog, "B2")

    # Stable sort: ties at the same CEFR level keep original (DB curriculum) order.
    assert [item["module_id"] for item in filtered["S"]] == ["b2-first", "b2-second"]


def test_filter_catalog_by_level_noop_when_current_level_missing_or_unknown():
    catalog = {"L": [{"module_id": "a1", "difficulty": "A1"}]}

    assert service._filter_catalog_by_level(catalog, None) == catalog
    assert service._filter_catalog_by_level(catalog, "") == catalog
    assert service._filter_catalog_by_level(catalog, "Native") == catalog


def test_filter_catalog_by_level_only_touches_skills_present_in_catalog():
    # A skill with no modules at all must not be fabricated as an empty entry --
    # optimizer.select_daily_activities relies on a missing key (not `[]`) to
    # fall back to FALLBACK_ACTIVITIES.
    catalog = {"L": [{"module_id": "a1", "difficulty": "A1"}]}

    filtered = service._filter_catalog_by_level(catalog, "B2")

    assert "S" not in filtered
    assert "R" not in filtered
    assert "W" not in filtered


def test_filter_catalog_by_level_handles_missing_difficulty_field_defensively():
    # Production catalogs always set "difficulty" (_modules_to_skill_catalog
    # defaults cefrLevel to "B1"), but this must not crash on malformed input.
    catalog = {"L": [{"module_id": "no-difficulty"}, {"module_id": "b2", "difficulty": "B2"}]}

    filtered = service._filter_catalog_by_level(catalog, "B2")

    assert {item["module_id"] for item in filtered["L"]} == {"no-difficulty", "b2"}


@respx.mock
async def test_generate_plan_selects_cefr_matched_module_over_lower_level_module(monkeypatch):
    """Regression test for the fixed CEFR-blindness bug: a B2 learner who is
    weak in listening gets the B2 listening module, not the A1 one, even
    though the A1 module is first in catalog/DB order."""
    clerk_id = f"test-user-{uuid.uuid4()}"

    respx.get(f"{service.AGT01_BASE_URL}/profile/{clerk_id}").mock(
        return_value=httpx.Response(200, json={
            "clerk_user_id": clerk_id,
            "irt_theta": {"L": -1.0, "S": 1.0, "R": 1.0, "W": 1.0},
            "goal_profile": {"currentLevel": "B2", "goals": ["business"]},
            "cold_start_flag": False,
        })
    )
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog/summary").mock(
        return_value=httpx.Response(200, json={
            "modules": [
                {
                    "id": "mod-listen-a1",
                    "title": "Basic greetings",
                    "cefrLevel": "A1",
                    "skillFocus": "listening",
                    "lessonCount": 1,
                    "exerciseCount": 1,
                    "lessons": [{"id": "l1", "exerciseIds": ["e1"]}],
                },
                {
                    "id": "mod-listen-b2",
                    "title": "Negotiation calls",
                    "cefrLevel": "B2",
                    "skillFocus": "listening",
                    "lessonCount": 1,
                    "exerciseCount": 1,
                    "lessons": [{"id": "l2", "exerciseIds": ["e2"]}],
                },
            ],
            "totalModules": 2,
            "totalLessons": 2,
            "totalExercises": 2,
        })
    )
    respx.post(f"{service.LM_SERVICE_BASE_URL}/internal/learning-paths").mock(
        return_value=httpx.Response(201, json={"id": "lm-path-1"})
    )

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    plan = await service.generate_plan(clerk_id, {"daily_minutes": 30, "goals": ["business"]})

    listening_activities = [a for a in plan["activities"] if a.get("skill_domain") == "L"]
    assert listening_activities, "expected at least one listening activity"
    assert listening_activities[0]["module_id"] == "mod-listen-b2"
    assert listening_activities[0]["difficulty"] == "B2"


@respx.mock
async def test_generate_plan_gives_closest_below_module_when_learner_exceeds_catalog_level(monkeypatch):
    """A C2 learner in a skill where the catalog only has lower-level content
    must still get real catalog content (the highest level available), not be
    silently pushed onto generic FALLBACK_ACTIVITIES."""
    clerk_id = f"test-user-{uuid.uuid4()}"

    respx.get(f"{service.AGT01_BASE_URL}/profile/{clerk_id}").mock(
        return_value=httpx.Response(200, json={
            "clerk_user_id": clerk_id,
            "irt_theta": {"L": -1.0, "S": 1.0, "R": 1.0, "W": 1.0},
            "goal_profile": {"currentLevel": "C2", "goals": []},
            "cold_start_flag": False,
        })
    )
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog/summary").mock(
        return_value=httpx.Response(200, json={
            "modules": [
                {
                    "id": "mod-listen-a1",
                    "title": "Basic greetings",
                    "cefrLevel": "A1",
                    "skillFocus": "listening",
                    "lessonCount": 1,
                    "exerciseCount": 1,
                    "lessons": [{"id": "l1", "exerciseIds": ["e1"]}],
                },
                {
                    "id": "mod-listen-b2",
                    "title": "Negotiation calls",
                    "cefrLevel": "B2",
                    "skillFocus": "listening",
                    "lessonCount": 1,
                    "exerciseCount": 1,
                    "lessons": [{"id": "l2", "exerciseIds": ["e2"]}],
                },
            ],
            "totalModules": 2,
            "totalLessons": 2,
            "totalExercises": 2,
        })
    )
    respx.post(f"{service.LM_SERVICE_BASE_URL}/internal/learning-paths").mock(
        return_value=httpx.Response(201, json={"id": "lm-path-1"})
    )

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    plan = await service.generate_plan(clerk_id, {"daily_minutes": 30, "goals": []})

    listening_activities = [a for a in plan["activities"] if a.get("skill_domain") == "L"]
    assert listening_activities, "expected at least one listening activity"
    # No C2 (or even B2-or-above) module exists; closest-below (B2) wins over A1.
    assert listening_activities[0]["module_id"] == "mod-listen-b2"


@respx.mock
async def test_generate_plan_cold_start_with_no_goal_profile_is_unaffected_by_level_filter(monkeypatch):
    """Users with no goal_profile / currentLevel (e.g. AGT-01 unreachable, or a
    brand-new profile) must see the pre-fix behavior unchanged: catalog order
    wins, since there is no level to filter by."""
    clerk_id = f"test-user-{uuid.uuid4()}"

    respx.get(f"{service.AGT01_BASE_URL}/profile/{clerk_id}").mock(
        return_value=httpx.Response(200, json={
            "clerk_user_id": clerk_id,
            "irt_theta": {"L": -1.0, "S": 1.0, "R": 1.0, "W": 1.0},
            "cold_start_flag": True,
            # no goal_profile key at all
        })
    )
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog/summary").mock(
        return_value=httpx.Response(200, json={
            "modules": [
                {
                    "id": "mod-listen-a1",
                    "title": "Basic greetings",
                    "cefrLevel": "A1",
                    "skillFocus": "listening",
                    "lessonCount": 1,
                    "exerciseCount": 1,
                    "lessons": [{"id": "l1", "exerciseIds": ["e1"]}],
                },
                {
                    "id": "mod-listen-b2",
                    "title": "Negotiation calls",
                    "cefrLevel": "B2",
                    "skillFocus": "listening",
                    "lessonCount": 1,
                    "exerciseCount": 1,
                    "lessons": [{"id": "l2", "exerciseIds": ["e2"]}],
                },
            ],
            "totalModules": 2,
            "totalLessons": 2,
            "totalExercises": 2,
        })
    )
    respx.post(f"{service.LM_SERVICE_BASE_URL}/internal/learning-paths").mock(
        return_value=httpx.Response(201, json={"id": "lm-path-1"})
    )

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    plan = await service.generate_plan(clerk_id, {"daily_minutes": 30, "goals": []})

    listening_activities = [a for a in plan["activities"] if a.get("skill_domain") == "L"]
    assert listening_activities[0]["module_id"] == "mod-listen-a1"


@respx.mock
async def test_fetch_catalog_summary_sends_no_query_params(patch_redis):
    """The Learning Materials /internal/catalog/summary route accepts no
    filter params (see internal.ts) -- the cached catalog is always the full,
    unfiltered set. CEFR filtering happens client-side afterward, in
    _filter_catalog_by_level(), so the shared Redis cache entry stays valid
    across learners at different levels."""
    route = respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog/summary").mock(
        return_value=httpx.Response(200, json={
            "modules": [], "totalModules": 0, "totalLessons": 0, "totalExercises": 0,
        })
    )

    await service._fetch_catalog_summary()

    assert route.calls[0].request.url.params == httpx.QueryParams()


# --- Other coverage gaps -------------------------------------------------


@respx.mock
async def test_generate_plan_merges_skill_estimates_over_profile_theta(monkeypatch):
    """skill_estimates is a caller-supplied override merged onto AGT-01's
    irt_theta before allocation -- covered on optimizer.allocate_skills
    directly, but never exercised end-to-end through generate_plan."""
    clerk_id = f"test-user-{uuid.uuid4()}"

    respx.get(f"{service.AGT01_BASE_URL}/profile/{clerk_id}").mock(
        return_value=httpx.Response(200, json={
            "clerk_user_id": clerk_id,
            "irt_theta": {"L": 1.0, "S": 1.0, "R": 1.0, "W": 1.0},
            "cold_start_flag": False,
        })
    )
    respx.get(f"{service.LM_SERVICE_BASE_URL}/internal/catalog/summary").mock(
        return_value=httpx.Response(404)
    )
    respx.post(f"{service.LM_SERVICE_BASE_URL}/internal/learning-paths").mock(
        return_value=httpx.Response(200)
    )

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    plan = await service.generate_plan(clerk_id, {
        "daily_minutes": 30,
        "goals": [],
        "skill_estimates": {"S": -2.0},
    })

    # Profile alone says all four skills are equally strong; the caller-supplied
    # skill_estimates override should make S dominate the allocation.
    assert plan["skill_allocation"]["S"] > plan["skill_allocation"]["L"]
    assert plan["skill_allocation"]["S"] > plan["skill_allocation"]["R"]
    assert plan["skill_allocation"]["S"] > plan["skill_allocation"]["W"]


def test_build_prompt_includes_goals_verbatim():
    """goals only ever reach the LLM rationale prompt -- assert the prompt
    content directly, since existing generate_plan tests mock call_llm to a
    fixed string and never inspect what was actually sent to it."""
    messages = service._build_prompt(
        {"irt_theta": {"L": 0.0}}, {"L": 0.25, "S": 0.25, "R": 0.25, "W": 0.25}, ["business", "ielts"],
    )

    assert messages[0]["role"] == "system"
    user_payload = json.loads(messages[1]["content"])
    assert user_payload["goals"] == ["business", "ielts"]


@respx.mock
async def test_fetch_catalog_summary_uses_redis_cache_and_skips_http(patch_redis):
    """All existing catalog tests exercise a cold Redis cache; this covers the
    cache-hit branch (service.py's `if cached: return ...`), which was
    previously untested."""
    await patch_redis.set(
        service.CATALOG_CACHE_KEY,
        json.dumps({"L": [{"activity_type": "cached", "title": "Cached", "estimated_minutes": 5}]}),
    )
    # Deliberately not mocking the HTTP route: if the cache is skipped and a
    # real request is attempted, respx raises instead of silently passing.

    catalog = await service._fetch_catalog_summary()

    assert catalog == {"L": [{"activity_type": "cached", "title": "Cached", "estimated_minutes": 5}]}

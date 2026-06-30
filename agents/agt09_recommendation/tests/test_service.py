"""
Tests for AGT-09 recommendation service layer.

Contracts under test:
  get_recommendations(clerk_user_id):
    - Cache hit → return cached list, no HTTP calls
    - Cache miss + cold_start=True → cold-start fallback (3 items, cold_start=True)
    - Cache miss + cold_start=False → score_items result cached and returned
    - AGT-01 unreachable → cold-start fallback
    - LMS unreachable → cold-start fallback
    - Result is cached after first compute (TTL=3600)

  invalidate_cache(clerk_user_id):
    - Deletes the reco:{clerk_user_id} Redis key
    - Subsequent get_recommendations recomputes (no stale cache served)
"""

import json
import pytest
import respx
import httpx
import fakeredis.aioredis

import agents.agt09_recommendation.service as svc


AGT01_URL = "http://agt01-profiling:8101"
LMS_URL = "http://learning-materials-service:4002"

_COLD_START_PROFILE = {"cold_start_flag": True, "irt_theta": {"L": 0.0, "S": None, "R": 0.0, "W": 0.0}}
_WARM_PROFILE = {"cold_start_flag": False, "irt_theta": {"L": 0.0, "S": None, "R": 0.0, "W": 0.0}}

_MODULES = [
    {"id": "m1", "title": "Module A", "skillDomain": "READING", "cefrLevel": "B1"},
    {"id": "m2", "title": "Module B", "skillDomain": "WRITING", "cefrLevel": "A2"},
    {"id": "m3", "title": "Module C", "skillDomain": "LISTENING", "cefrLevel": "B2"},
]


@pytest.fixture
def fake_redis(monkeypatch):
    """In-memory Redis replacing the real pool."""
    store = fakeredis.aioredis.FakeRedis()

    async def _get_redis():
        return store

    monkeypatch.setattr(svc, "get_redis", _get_redis)
    return store


# ── cold-start fallback ───────────────────────────────────────────────────────

@respx.mock
async def test_cold_start_returns_3_items(fake_redis):
    respx.get(f"{AGT01_URL}/profile/user-cold").mock(
        return_value=httpx.Response(200, json=_COLD_START_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=_MODULES)
    )

    result = await svc.get_recommendations("user-cold")
    assert len(result) == 3


@respx.mock
async def test_cold_start_items_have_cold_start_flag(fake_redis):
    respx.get(f"{AGT01_URL}/profile/user-cold").mock(
        return_value=httpx.Response(200, json=_COLD_START_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=_MODULES)
    )

    result = await svc.get_recommendations("user-cold")
    assert all(item.get("cold_start") is True for item in result)


@respx.mock
async def test_cold_start_uses_real_module_ids_when_lms_reachable(fake_redis):
    real_modules = [
        {"id": "mod-uuid-001", "title": "Module 1", "skillDomain": "READING", "cefrLevel": "A1"},
        {"id": "mod-uuid-002", "title": "Module 2", "skillDomain": "WRITING", "cefrLevel": "B1"},
        {"id": "mod-uuid-003", "title": "Module 3", "skillDomain": "LISTENING", "cefrLevel": "A2"},
    ]
    respx.get(f"{AGT01_URL}/profile/user-new").mock(
        return_value=httpx.Response(200, json=_COLD_START_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=real_modules)
    )

    result = await svc.get_recommendations("user-new")

    assert len(result) == 3
    result_ids = {item["id"] for item in result}
    assert not any(id.startswith("stub-") for id in result_ids)
    assert result_ids == {"mod-uuid-001", "mod-uuid-002", "mod-uuid-003"}


@respx.mock
async def test_cold_start_fewer_than_3_modules_returns_all_available(fake_redis):
    one_module = [{"id": "mod-only-one", "title": "Only Module", "skillDomain": "SPEAKING", "cefrLevel": "B2"}]
    respx.get(f"{AGT01_URL}/profile/user-new2").mock(
        return_value=httpx.Response(200, json=_COLD_START_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=one_module)
    )

    result = await svc.get_recommendations("user-new2")

    assert len(result) == 1
    assert result[0]["id"] == "mod-only-one"


@respx.mock
async def test_cold_start_empty_modules_falls_back_to_unreachable_fallback(fake_redis):
    respx.get(f"{AGT01_URL}/profile/user-empty").mock(
        return_value=httpx.Response(200, json=_COLD_START_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=[])
    )

    result = await svc.get_recommendations("user-empty")

    assert len(result) == 3
    assert all(item.get("cold_start") is True for item in result)
    assert all(item["id"].startswith("stub-") for item in result)


@respx.mock
async def test_agt01_unreachable_returns_cold_start_fallback(fake_redis):
    respx.get(f"{AGT01_URL}/profile/user-x").mock(
        side_effect=httpx.ConnectError("Connection refused")
    )

    result = await svc.get_recommendations("user-x")
    assert len(result) == 3
    assert all(item.get("cold_start") is True for item in result)


@respx.mock
async def test_lms_unreachable_returns_cold_start_fallback(fake_redis):
    respx.get(f"{AGT01_URL}/profile/user-x").mock(
        return_value=httpx.Response(200, json=_WARM_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        side_effect=httpx.ConnectError("Connection refused")
    )

    result = await svc.get_recommendations("user-x")
    assert len(result) == 3
    assert all(item.get("cold_start") is True for item in result)


@respx.mock
async def test_agt01_500_returns_cold_start_fallback(fake_redis):
    respx.get(f"{AGT01_URL}/profile/user-x").mock(
        return_value=httpx.Response(500, json={"error": "internal"})
    )

    result = await svc.get_recommendations("user-x")
    assert len(result) == 3
    assert all(item.get("cold_start") is True for item in result)


# ── warm-profile scoring ──────────────────────────────────────────────────────

@respx.mock
async def test_warm_profile_returns_scored_items(fake_redis):
    respx.get(f"{AGT01_URL}/profile/user-warm").mock(
        return_value=httpx.Response(200, json=_WARM_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=_MODULES)
    )

    result = await svc.get_recommendations("user-warm")
    assert len(result) <= 3
    assert len(result) > 0


@respx.mock
async def test_warm_profile_items_have_rationale(fake_redis):
    respx.get(f"{AGT01_URL}/profile/user-warm").mock(
        return_value=httpx.Response(200, json=_WARM_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=_MODULES)
    )

    result = await svc.get_recommendations("user-warm")
    for item in result:
        assert "rationale" in item


# ── Redis cache ───────────────────────────────────────────────────────────────

@respx.mock
async def test_cache_miss_stores_result_in_redis(fake_redis):
    respx.get(f"{AGT01_URL}/profile/user-cache").mock(
        return_value=httpx.Response(200, json=_COLD_START_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=_MODULES)
    )

    await svc.get_recommendations("user-cache")
    raw = await fake_redis.get("reco:user-cache")
    assert raw is not None
    assert isinstance(json.loads(raw), list)


@respx.mock
async def test_cache_hit_does_not_call_http(fake_redis):
    # Prepopulate cache manually
    cached = [{"id": "cached-item", "title": "Cached", "cold_start": True}]
    await fake_redis.set("reco:user-hit", json.dumps(cached), ex=3600)

    # These routes must not be called — respx will raise if they are
    respx.get(f"{AGT01_URL}/profile/user-hit").mock(
        side_effect=AssertionError("AGT-01 must not be called on cache hit")
    )
    respx.get(f"{LMS_URL}/modules").mock(
        side_effect=AssertionError("LMS must not be called on cache hit")
    )

    result = await svc.get_recommendations("user-hit")
    assert result == cached


@respx.mock
async def test_cache_hit_returns_exact_cached_data(fake_redis):
    cached = [{"id": "x", "title": "X", "skillDomain": "READING"}]
    await fake_redis.set("reco:user-exact", json.dumps(cached), ex=3600)

    respx.get(f"{AGT01_URL}/profile/user-exact").mock(
        side_effect=AssertionError("must not be called")
    )
    respx.get(f"{LMS_URL}/modules").mock(
        side_effect=AssertionError("must not be called")
    )

    result = await svc.get_recommendations("user-exact")
    assert result == cached


@respx.mock
async def test_different_users_have_independent_caches(fake_redis):
    # User A: cached with 1 cold-start item
    await fake_redis.set("reco:user-a", json.dumps([{"id": "a", "cold_start": True}]), ex=3600)

    # User B: cache miss → calls HTTP
    respx.get(f"{AGT01_URL}/profile/user-b").mock(
        return_value=httpx.Response(200, json=_COLD_START_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=_MODULES)
    )

    result_a = await svc.get_recommendations("user-a")
    result_b = await svc.get_recommendations("user-b")

    assert result_a[0]["id"] == "a"
    # user-b got computed items — all cold start
    assert all(item.get("cold_start") is True for item in result_b)


# ── invalidate_cache ──────────────────────────────────────────────────────────

async def test_invalidate_cache_removes_redis_key(fake_redis):
    await fake_redis.set("reco:user-inv", json.dumps([{"id": "stale"}]), ex=3600)

    await svc.invalidate_cache("user-inv")

    raw = await fake_redis.get("reco:user-inv")
    assert raw is None


@respx.mock
async def test_after_invalidation_next_call_recomputes(fake_redis):
    # Seed cache
    await fake_redis.set("reco:user-reinv", json.dumps([{"id": "old"}]), ex=3600)

    # Invalidate
    await svc.invalidate_cache("user-reinv")

    # Next call must recompute via HTTP
    respx.get(f"{AGT01_URL}/profile/user-reinv").mock(
        return_value=httpx.Response(200, json=_COLD_START_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=_MODULES)
    )

    result = await svc.get_recommendations("user-reinv")
    # Must not return the old stale item
    assert not any(item.get("id") == "old" for item in result)


async def test_invalidate_nonexistent_key_does_not_raise(fake_redis):
    await svc.invalidate_cache("user-never-existed")  # must not raise

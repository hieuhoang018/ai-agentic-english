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
import time
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
    {"id": "m1", "title": "Module A", "skillFocus": "READING", "cefrLevel": "B1"},
    {"id": "m2", "title": "Module B", "skillFocus": "WRITING", "cefrLevel": "A2"},
    {"id": "m3", "title": "Module C", "skillFocus": "LISTENING", "cefrLevel": "B2"},
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
        {"id": "mod-uuid-001", "title": "Module 1", "skillFocus": "READING", "cefrLevel": "A1"},
        {"id": "mod-uuid-002", "title": "Module 2", "skillFocus": "WRITING", "cefrLevel": "B1"},
        {"id": "mod-uuid-003", "title": "Module 3", "skillFocus": "LISTENING", "cefrLevel": "A2"},
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
    one_module = [{"id": "mod-only-one", "title": "Only Module", "skillFocus": "SPEAKING", "cefrLevel": "B2"}]
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


@respx.mock
async def test_warm_profile_uses_cefr_derived_difficulty_not_constant(fake_redis):
    # _MODULES has cefrLevel B1 (m1), A2 (m2), B2 (m3) — a real per-item
    # difficulty derived from cefrLevel must differ across items, not the
    # old hardcoded constant 0.5 for every candidate.
    respx.get(f"{AGT01_URL}/profile/user-warm-diff").mock(
        return_value=httpx.Response(200, json=_WARM_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=_MODULES)
    )

    result = await svc.get_recommendations("user-warm-diff")
    difficulties = {item["id"]: item["difficulty"] for item in result}
    assert len(set(difficulties.values())) > 1


@respx.mock
async def test_warm_profile_reads_skill_focus_field_from_lms(fake_redis):
    # Real LMS /modules DTO field is "skillFocus", not "skillDomain".
    modules = [
        {"id": "sf-1", "title": "Speak Up", "skillFocus": "SPEAKING", "cefrLevel": "B1"},
    ]
    respx.get(f"{AGT01_URL}/profile/user-warm-sf").mock(
        return_value=httpx.Response(200, json=_WARM_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=modules)
    )

    result = await svc.get_recommendations("user-warm-sf")
    assert result[0]["skillDomain"] == "SPEAKING"


# ── recently-seen novelty filter ──────────────────────────────────────────────

_R1_PROFILE = {"cold_start_flag": False, "irt_theta": {"L": 0.0, "S": 0.0, "R": 1.0, "W": 0.0}}
_FIVE_READING_MODULES = [
    {"id": "a1", "title": "A1 mod", "skillFocus": "READING", "cefrLevel": "A1"},
    {"id": "a2", "title": "A2 mod", "skillFocus": "READING", "cefrLevel": "A2"},
    {"id": "b1", "title": "B1 mod", "skillFocus": "READING", "cefrLevel": "B1"},
    {"id": "b2", "title": "B2 mod", "skillFocus": "READING", "cefrLevel": "B2"},
    {"id": "c1", "title": "C1 mod", "skillFocus": "READING", "cefrLevel": "C1"},
]


@respx.mock
async def test_items_recommended_recently_are_excluded_next_time(fake_redis):
    respx.get(f"{AGT01_URL}/profile/user-novelty").mock(
        return_value=httpx.Response(200, json=_R1_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=_FIVE_READING_MODULES)
    )

    first = await svc.get_recommendations("user-novelty")
    first_ids = {item["id"] for item in first}
    assert first_ids == {"c1", "b2", "b1"}  # highest-scoring 3 (theta_R=1.0)

    await svc.invalidate_cache("user-novelty")
    second = await svc.get_recommendations("user-novelty")
    second_ids = {item["id"] for item in second}

    assert second_ids.isdisjoint(first_ids)
    assert second_ids == {"a2", "a1"}


@respx.mock
async def test_items_seen_more_than_14_days_ago_are_eligible_again_but_recent_ones_are_not(fake_redis):
    stale_ts = time.time() - (15 * 86400)
    recent_ts = time.time() - 3600
    await fake_redis.zadd("reco:seen:user-stale", {"a1": stale_ts, "b2": recent_ts})

    two_modules = [_FIVE_READING_MODULES[0], _FIVE_READING_MODULES[3]]  # a1, b2
    respx.get(f"{AGT01_URL}/profile/user-stale").mock(
        return_value=httpx.Response(200, json=_R1_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=two_modules)
    )

    result = await svc.get_recommendations("user-stale")
    ids = {item["id"] for item in result}
    assert ids == {"a1"}  # a1's 15-day-old entry has expired; b2's 1h-old entry has not


class _FlakyNoveltyRedis:
    """Wraps a real redis client but simulates the sorted-set novelty calls failing."""

    def __init__(self, real):
        self._real = real

    def __getattr__(self, name):
        return getattr(self._real, name)

    async def zremrangebyscore(self, *args, **kwargs):
        raise ConnectionError("redis down")

    async def zadd(self, *args, **kwargs):
        raise ConnectionError("redis down")


@respx.mock
async def test_novelty_redis_failure_degrades_gracefully_instead_of_crashing(monkeypatch, fake_redis):
    flaky = _FlakyNoveltyRedis(fake_redis)

    async def _get_flaky_redis():
        return flaky

    monkeypatch.setattr(svc, "get_redis", _get_flaky_redis)

    respx.get(f"{AGT01_URL}/profile/user-flaky").mock(
        return_value=httpx.Response(200, json=_WARM_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=_MODULES)
    )

    # Must not raise — a Redis hiccup on the novelty filter should degrade to
    # "no recently-seen data", not take down the whole recommendation flow.
    result = await svc.get_recommendations("user-flaky")
    assert len(result) > 0
    assert not any(item.get("cold_start") is True for item in result)


@respx.mock
async def test_recording_seen_items_sets_14_day_ttl(fake_redis):
    respx.get(f"{AGT01_URL}/profile/user-ttl").mock(
        return_value=httpx.Response(200, json=_R1_PROFILE)
    )
    respx.get(f"{LMS_URL}/modules").mock(
        return_value=httpx.Response(200, json=_FIVE_READING_MODULES)
    )

    await svc.get_recommendations("user-ttl")
    ttl = await fake_redis.ttl("reco:seen:user-ttl")
    assert 0 < ttl <= 14 * 86400


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

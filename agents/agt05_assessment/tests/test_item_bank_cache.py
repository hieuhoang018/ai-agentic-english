"""
Tests for Redis-cached item bank in AGT-05.

Cache contract:
  - key:  agt05:item_bank:{skill_domain}
  - TTL:  300 seconds
  - Miss: fetch from LMS, store, return
  - Hit:  return cached, do NOT call LMS
  - LMS error + empty cache: return []
"""
import json
import pytest
import fakeredis.aioredis

import agents.agt05_assessment.service as svc


SAMPLE_ITEMS = [
    {"item_id": f"item-{i}", "difficulty_param": round(i / 15.0 - 1.0, 3)}
    for i in range(1, 31)
]


@pytest.fixture
def fake_redis(monkeypatch):
    """Inject an in-memory fakeredis instance instead of the real Redis pool."""
    server = fakeredis.aioredis.FakeRedis()
    monkeypatch.setattr(svc, "get_redis", lambda: server)
    return server


@pytest.fixture
def lms_returns_items(monkeypatch):
    """Patch the raw LMS HTTP call to return SAMPLE_ITEMS."""
    call_count = {"n": 0}

    async def fake_fetch_lms(skill_domain: str) -> list[dict]:
        call_count["n"] += 1
        return SAMPLE_ITEMS

    monkeypatch.setattr(svc, "_fetch_lms_items", fake_fetch_lms)
    return call_count


@pytest.fixture
def lms_returns_empty(monkeypatch):
    """Patch the raw LMS HTTP call to return []."""
    async def fake_fetch_lms(skill_domain: str) -> list[dict]:
        return []

    monkeypatch.setattr(svc, "_fetch_lms_items", fake_fetch_lms)


# ── cache miss: fetch from LMS ────────────────────────────────────────────────

async def test_cache_miss_returns_lms_items(fake_redis, lms_returns_items):
    items = await svc._fetch_item_bank("READING")
    assert items == SAMPLE_ITEMS


async def test_cache_miss_calls_lms_exactly_once(fake_redis, lms_returns_items):
    await svc._fetch_item_bank("READING")
    assert lms_returns_items["n"] == 1


async def test_cache_miss_stores_in_redis(fake_redis, lms_returns_items):
    await svc._fetch_item_bank("READING")
    raw = await fake_redis.get("agt05:item_bank:READING")
    assert raw is not None
    assert json.loads(raw) == SAMPLE_ITEMS


async def test_cache_miss_sets_ttl(fake_redis, lms_returns_items):
    await svc._fetch_item_bank("READING")
    ttl = await fake_redis.ttl("agt05:item_bank:READING")
    assert 0 < ttl <= 300


# ── cache hit: skip LMS ───────────────────────────────────────────────────────

async def test_cache_hit_returns_cached_items(fake_redis, lms_returns_items):
    await svc._fetch_item_bank("READING")   # populate cache
    lms_returns_items["n"] = 0              # reset counter
    items = await svc._fetch_item_bank("READING")
    assert items == SAMPLE_ITEMS


async def test_cache_hit_does_not_call_lms(fake_redis, lms_returns_items):
    await svc._fetch_item_bank("READING")   # populate cache
    lms_returns_items["n"] = 0
    await svc._fetch_item_bank("READING")
    assert lms_returns_items["n"] == 0


# ── cache key is domain-specific ─────────────────────────────────────────────

async def test_different_domains_use_different_cache_keys(fake_redis, lms_returns_items):
    await svc._fetch_item_bank("READING")
    await svc._fetch_item_bank("WRITING")
    reading_raw = await fake_redis.get("agt05:item_bank:READING")
    writing_raw = await fake_redis.get("agt05:item_bank:WRITING")
    assert reading_raw is not None
    assert writing_raw is not None


# ── LMS unavailable ───────────────────────────────────────────────────────────

async def test_lms_unavailable_returns_empty_list(fake_redis, lms_returns_empty):
    items = await svc._fetch_item_bank("READING")
    assert items == []


async def test_lms_unavailable_does_not_cache_empty_result(fake_redis, lms_returns_empty):
    await svc._fetch_item_bank("READING")
    raw = await fake_redis.get("agt05:item_bank:READING")
    assert raw is None

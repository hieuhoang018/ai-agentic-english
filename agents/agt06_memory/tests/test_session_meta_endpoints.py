"""HTTP-level tests for the session-meta CRUD and turn-increment endpoints."""
import pytest
import fakeredis.aioredis
from httpx import AsyncClient, ASGITransport

from agents.agt06_memory import stm
from agents.agt06_memory.main import app


@pytest.fixture(autouse=True)
def patch_redis(monkeypatch):
    fake = fakeredis.aioredis.FakeRedis()

    async def fake_get_redis():
        return fake

    monkeypatch.setattr(stm, "get_redis", fake_get_redis)
    return fake


async def test_post_session_meta_then_get_returns_it():
    meta = {"start_time": "2026-06-30T10:00:00+00:00", "clerk_user_id": "u1",
            "skill_focus": "SPEAKING", "profile": {}, "profile_loaded": True}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/sessions/sessA/meta", json=meta)
        assert resp.status_code == 204

        resp = await client.get("/sessions/sessA/meta")
        assert resp.status_code == 200
        assert resp.json() == meta


async def test_get_session_meta_404_when_missing():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/sessions/no-such-session/meta")
        assert resp.status_code == 404


async def test_delete_session_meta_returns_204():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/sessions/sessB/meta", json={"clerk_user_id": "u2"})
        resp = await client.delete("/sessions/sessB/meta")
        assert resp.status_code == 204
        resp = await client.get("/sessions/sessB/meta")
        assert resp.status_code == 404


async def test_increment_turn_endpoint_returns_count():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/sessions/sessC/meta/increment-turn")
        assert resp.status_code == 200
        assert resp.json() == {"turn_count": 1}

        resp = await client.post("/sessions/sessC/meta/increment-turn")
        assert resp.json() == {"turn_count": 2}


async def test_get_turn_count_endpoint_returns_zero_for_new_session():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/sessions/fresh-session/meta/turn-count")
        assert resp.status_code == 200
        assert resp.json() == {"turn_count": 0}


async def test_get_turn_count_endpoint_reflects_increments():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/sessions/sessD/meta/increment-turn")
        await client.post("/sessions/sessD/meta/increment-turn")
        resp = await client.get("/sessions/sessD/meta/turn-count")
        assert resp.json() == {"turn_count": 2}

"""
Tests for speaking-session ticket issuance: agents.agt03_tutor.tickets
(issue_ticket/consume_ticket) and the POST /speaking/session-ticket route
in main.py.
"""

import asyncio
import json

import fakeredis.aioredis
from fastapi.testclient import TestClient

from agents.agt03_tutor import tickets
from agents.agt03_tutor.main import app
from agents.shared.testing import auth_header

client = TestClient(app)


def _patch_redis(monkeypatch):
    store = fakeredis.aioredis.FakeRedis()

    async def _get_redis():
        return store

    monkeypatch.setattr(tickets, "get_redis", _get_redis)
    return store


async def test_issue_ticket_stores_correct_redis_payload_and_ttl(monkeypatch):
    store = _patch_redis(monkeypatch)

    response = await tickets.issue_ticket("user-abc", "SPEAKING")

    raw = await store.get(f"speaking-ticket:{response.ticket}")
    assert raw is not None
    assert json.loads(raw) == {
        "session_id": response.session_id,
        "clerk_user_id": "user-abc",
        "skill_focus": "SPEAKING",
    }

    ttl = await store.ttl(f"speaking-ticket:{response.ticket}")
    assert 0 < ttl <= tickets.TICKET_TTL_SECONDS


async def test_consume_ticket_is_single_use(monkeypatch):
    _patch_redis(monkeypatch)

    response = await tickets.issue_ticket("user-abc", "SPEAKING")

    first = await tickets.consume_ticket(response.ticket)
    assert first == {
        "session_id": response.session_id,
        "clerk_user_id": "user-abc",
        "skill_focus": "SPEAKING",
    }

    second = await tickets.consume_ticket(response.ticket)
    assert second is None


async def test_consume_ticket_returns_none_for_unknown_ticket(monkeypatch):
    _patch_redis(monkeypatch)

    assert await tickets.consume_ticket("never-issued") is None


def test_session_ticket_endpoint_requires_bearer_token(monkeypatch):
    _patch_redis(monkeypatch)

    resp = client.post("/speaking/session-ticket", json={})
    assert resp.status_code == 401


def test_session_ticket_endpoint_issues_ticket_from_jwt_identity(monkeypatch):
    _patch_redis(monkeypatch)

    resp = client.post("/speaking/session-ticket", json={}, headers=auth_header("user-http"))

    assert resp.status_code == 200
    data = resp.json()
    assert data["expires_in_seconds"] == tickets.TICKET_TTL_SECONDS
    assert data["ticket"]
    assert data["session_id"]


def test_session_ticket_endpoint_ignores_client_supplied_clerk_user_id(monkeypatch):
    """The request body has no clerk_user_id field — proves the endpoint
    can't be tricked into issuing a ticket for someone else by adding one."""
    store = _patch_redis(monkeypatch)

    resp = client.post(
        "/speaking/session-ticket",
        json={"clerk_user_id": "someone-else"},
        headers=auth_header("user-http"),
    )
    assert resp.status_code == 200

    ticket = resp.json()["ticket"]
    raw = asyncio.run(store.get(f"speaking-ticket:{ticket}"))
    payload = json.loads(raw)
    assert payload["clerk_user_id"] == "user-http"


def test_session_ticket_endpoint_no_body_defaults_skill_focus(monkeypatch):
    _patch_redis(monkeypatch)

    resp = client.post("/speaking/session-ticket", headers=auth_header("user-http"))
    assert resp.status_code == 200


def test_session_ticket_endpoint_two_calls_produce_different_tickets(monkeypatch):
    _patch_redis(monkeypatch)

    first = client.post("/speaking/session-ticket", json={}, headers=auth_header("user-http")).json()
    second = client.post("/speaking/session-ticket", json={}, headers=auth_header("user-http")).json()

    assert first["ticket"] != second["ticket"]
    assert first["session_id"] != second["session_id"]

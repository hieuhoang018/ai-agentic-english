"""
Tests for AGT-06 HTTP endpoints (main.py): auth enforcement and field
scoping on the frontend-facing GET /summary/{clerk_user_id}.
"""

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import agents.agt06_memory.main as main_module
from agents.agt06_memory.main import app
from agents.shared.testing import auth_header

client = TestClient(app)

USER = "user_x"


async def test_lifespan_does_not_crash_when_kafka_producer_is_unreachable(monkeypatch):
    """
    Regression test for a real production incident: main.py's lifespan used
    to `await get_producer()` unprotected, so a Kafka outage at container
    boot crashed the whole app and relied on Docker's restart policy to
    eventually retry. The producer call must now tolerate a Kafka outage at
    startup, matching agents/agt_orchestrator/main.py's existing pattern.
    """
    monkeypatch.setattr(main_module, "get_pool", AsyncMock())
    monkeypatch.setattr(main_module, "get_redis", AsyncMock())
    monkeypatch.setattr(
        main_module, "get_producer",
        AsyncMock(side_effect=Exception("Unable to bootstrap from [('kafka', 9092)]")),
    )
    monkeypatch.setattr(main_module, "start_consumers", AsyncMock(return_value=[]))
    monkeypatch.setattr(main_module, "close_pool", AsyncMock())
    monkeypatch.setattr(main_module, "close_redis", AsyncMock())
    monkeypatch.setattr(main_module, "close_producer", AsyncMock())

    async with main_module.lifespan(main_module.app):
        pass  # must not raise even though get_producer() raised inside


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["agent"] == "AGT-06"
    assert data["status"] == "ok"


def test_summary_requires_bearer_token():
    resp = client.get(f"/summary/{USER}")
    assert resp.status_code == 401


def test_summary_rejects_mismatched_user():
    resp = client.get(f"/summary/{USER}", headers=auth_header("someone-else"))
    assert resp.status_code == 403


def test_summary_returns_start_and_end_time_only(monkeypatch):
    """
    Regression guard: summary_metrics and other session fields must never
    leak through this route — only start_time/end_time, for the weekly
    activity chart's client-side reduce.
    """
    async def _fake_get_sessions(clerk_user_id, limit=20):
        return [
            {
                "session_id": "s1",
                "clerk_user_id": clerk_user_id,
                "start_time": "2026-07-01T10:00:00+00:00",
                "end_time": "2026-07-01T10:20:00+00:00",
                "skill_focus": "READING",
                "summary_metrics": {"accuracy": 0.9},
            }
        ]

    monkeypatch.setattr(main_module.ltm, "get_sessions", _fake_get_sessions)

    resp = client.get(f"/summary/{USER}", headers=auth_header(USER))

    assert resp.status_code == 200
    assert resp.json() == [
        {"start_time": "2026-07-01T10:00:00+00:00", "end_time": "2026-07-01T10:20:00+00:00"}
    ]


def test_summary_passes_limit_through(monkeypatch):
    captured = {}

    async def _fake_get_sessions(clerk_user_id, limit=20):
        captured["limit"] = limit
        return []

    monkeypatch.setattr(main_module.ltm, "get_sessions", _fake_get_sessions)

    resp = client.get(f"/summary/{USER}?limit=7", headers=auth_header(USER))

    assert resp.status_code == 200
    assert captured["limit"] == 7


def test_review_center_requires_bearer_token():
    resp = client.get(f"/review-center/{USER}")
    assert resp.status_code == 401


def test_review_center_rejects_mismatched_user():
    resp = client.get(f"/review-center/{USER}", headers=auth_header("someone-else"))
    assert resp.status_code == 403


def test_review_center_returns_bundle_for_matching_user(monkeypatch):
    async def _fake_get_errors(clerk_user_id, limit=50):
        return [{"event_id": "e1"}]

    async def _fake_get_vocabulary(clerk_user_id, limit=100):
        return [{"vocab_id": "v1"}]

    async def _fake_get_sessions(clerk_user_id, limit=20):
        return [{"session_id": "s1"}]

    async def _fake_get_conversations(clerk_user_id, limit=20):
        return [{"conv_id": "c1"}]

    monkeypatch.setattr(main_module.ltm, "get_errors", _fake_get_errors)
    monkeypatch.setattr(main_module.ltm, "get_vocabulary", _fake_get_vocabulary)
    monkeypatch.setattr(main_module.ltm, "get_sessions", _fake_get_sessions)
    monkeypatch.setattr(main_module.ltm, "get_conversations", _fake_get_conversations)

    resp = client.get(f"/review-center/{USER}", headers=auth_header(USER))

    assert resp.status_code == 200
    assert resp.json() == {
        "errors": [{"event_id": "e1"}],
        "vocabulary": [{"vocab_id": "v1"}],
        "sessions": [{"session_id": "s1"}],
        "conversations": [{"conv_id": "c1"}],
        "semantic_search_available": False,
    }


def test_update_conversation_title_requires_bearer_token():
    resp = client.patch(f"/review-center/{USER}/conversations/c1/title", json={"title": "New title"})
    assert resp.status_code == 401


def test_update_conversation_title_rejects_mismatched_user():
    resp = client.patch(
        f"/review-center/{USER}/conversations/c1/title",
        json={"title": "New title"},
        headers=auth_header("someone-else"),
    )
    assert resp.status_code == 403


def test_update_conversation_title_rejects_blank_title():
    resp = client.patch(
        f"/review-center/{USER}/conversations/c1/title",
        json={"title": ""},
        headers=auth_header(USER),
    )
    assert resp.status_code == 422


def test_update_conversation_title_returns_404_for_unowned_conversation(monkeypatch):
    async def _fake_update_conversation_title(clerk_user_id, conv_id, title):
        return None  # simulates the WHERE clerk_user_id=$2 clause matching no row

    monkeypatch.setattr(main_module.ltm, "update_conversation_title", _fake_update_conversation_title)

    resp = client.patch(
        f"/review-center/{USER}/conversations/someone-elses-conv/title",
        json={"title": "New title"},
        headers=auth_header(USER),
    )

    assert resp.status_code == 404


def test_update_conversation_title_updates_and_returns_row(monkeypatch):
    captured = {}

    async def _fake_update_conversation_title(clerk_user_id, conv_id, title):
        captured["args"] = (clerk_user_id, conv_id, title)
        return {
            "conv_id": conv_id,
            "session_id": "s1",
            "clerk_user_id": clerk_user_id,
            "transcript": "[]",
            "title": title,
            "created_at": "2026-07-08T10:00:00+00:00",
        }

    monkeypatch.setattr(main_module.ltm, "update_conversation_title", _fake_update_conversation_title)

    resp = client.patch(
        f"/review-center/{USER}/conversations/c1/title",
        json={"title": "Đặt bàn nhà hàng"},
        headers=auth_header(USER),
    )

    assert resp.status_code == 200
    assert resp.json()["title"] == "Đặt bàn nhà hàng"
    assert captured["args"] == (USER, "c1", "Đặt bàn nhà hàng")

"""
Tests for the WebSocket session handler using FastAPI's TestClient, which
supports WebSocket testing via a synchronous context-manager `with` block
(this is the standard, documented way to test FastAPI WebSocket routes —
it does NOT use httpx/respx since WebSocket protocol is not HTTP request/response).
"""
from unittest.mock import AsyncMock
from fastapi.testclient import TestClient
from agents.agt03_tutor.main import app
from agents.agt03_tutor import websocket_handler


def test_websocket_start_message_starts_session(monkeypatch):
    fake_start = AsyncMock(return_value={
        "session_id": "ws-sess-1", "clerk_user_id": "user1", "skill_focus": "SPEAKING",
        "opening_message": "Hi! Let's practice speaking.", "profile_loaded": True, "plan_loaded": False,
    })
    monkeypatch.setattr(websocket_handler, "start_session", fake_start)

    client = TestClient(app)
    with client.websocket_connect("/ws/sessions/ws-sess-1") as ws:
        ws.send_json({"type": "start", "clerk_user_id": "user1", "skill_focus": "SPEAKING"})
        response = ws.receive_json()

    assert response["type"] == "session_started"
    assert response["opening_message"] == "Hi! Let's practice speaking."
    fake_start.assert_awaited_once_with("user1", "SPEAKING", "ws-sess-1")


def test_websocket_turn_message_returns_turn_result(monkeypatch):
    fake_start = AsyncMock(return_value={
        "session_id": "ws-sess-2", "clerk_user_id": "user1", "skill_focus": "SPEAKING",
        "opening_message": "Hi!", "profile_loaded": True, "plan_loaded": False,
    })
    fake_pipeline = AsyncMock(return_value={
        "session_id": "ws-sess-2", "assistant_message": "Tell me more.",
        "transcript_text": "I work in finance.", "grammar_feedback": None,
        "translated_message": None, "translation_zone": "en_only",
    })
    monkeypatch.setattr(websocket_handler, "start_session", fake_start)
    monkeypatch.setattr(websocket_handler, "run_turn_pipeline", fake_pipeline)

    client = TestClient(app)
    with client.websocket_connect("/ws/sessions/ws-sess-2") as ws:
        ws.send_json({"type": "start", "clerk_user_id": "user1", "skill_focus": "SPEAKING"})
        ws.receive_json()
        ws.send_json({"type": "turn", "user_message": "I work in finance."})
        response = ws.receive_json()

    assert response["type"] == "turn_result"
    assert response["assistant_message"] == "Tell me more."
    fake_pipeline.assert_awaited_once_with("ws-sess-2", "I work in finance.", None)


def test_websocket_end_message_ends_session_and_closes(monkeypatch):
    fake_start = AsyncMock(return_value={
        "session_id": "ws-sess-3", "clerk_user_id": "user1", "skill_focus": "SPEAKING",
        "opening_message": "Hi!", "profile_loaded": True, "plan_loaded": False,
    })
    fake_end = AsyncMock(return_value={
        "session_id": "ws-sess-3", "consolidated": True, "duration_minutes": 2.5, "turns_completed": 1,
    })
    monkeypatch.setattr(websocket_handler, "start_session", fake_start)
    monkeypatch.setattr(websocket_handler, "end_session", fake_end)

    client = TestClient(app)
    with client.websocket_connect("/ws/sessions/ws-sess-3") as ws:
        ws.send_json({"type": "start", "clerk_user_id": "user1", "skill_focus": "SPEAKING"})
        ws.receive_json()
        ws.send_json({"type": "end"})
        response = ws.receive_json()

    assert response["type"] == "session_ended"
    assert response["consolidated"] is True
    fake_end.assert_awaited_once_with("ws-sess-3", "user1", "SPEAKING")


def test_websocket_disconnect_without_end_message_still_ends_session(monkeypatch):
    """If the client disconnects abruptly (closes tab, network drop) without
    sending {"type": "end"}, the server must still call end_session so the
    session doesn't leak in Redis until TTL expiry and AGT-01 still gets
    its session.end event."""
    fake_start = AsyncMock(return_value={
        "session_id": "ws-sess-4", "clerk_user_id": "user1", "skill_focus": "SPEAKING",
        "opening_message": "Hi!", "profile_loaded": True, "plan_loaded": False,
    })
    fake_end = AsyncMock(return_value={
        "session_id": "ws-sess-4", "consolidated": True, "duration_minutes": 1.0, "turns_completed": 0,
    })
    monkeypatch.setattr(websocket_handler, "start_session", fake_start)
    monkeypatch.setattr(websocket_handler, "end_session", fake_end)

    client = TestClient(app)
    with client.websocket_connect("/ws/sessions/ws-sess-4") as ws:
        ws.send_json({"type": "start", "clerk_user_id": "user1", "skill_focus": "SPEAKING"})
        ws.receive_json()
        # No "end" message — exiting the `with` block closes the socket abruptly.

    fake_end.assert_awaited_once_with("ws-sess-4", "user1", "SPEAKING")


def test_websocket_invalid_message_type_returns_error_not_crash(monkeypatch):
    fake_start = AsyncMock(return_value={
        "session_id": "ws-sess-5", "clerk_user_id": "user1", "skill_focus": "SPEAKING",
        "opening_message": "Hi!", "profile_loaded": True, "plan_loaded": False,
    })
    monkeypatch.setattr(websocket_handler, "start_session", fake_start)

    client = TestClient(app)
    with client.websocket_connect("/ws/sessions/ws-sess-5") as ws:
        ws.send_json({"type": "start", "clerk_user_id": "user1", "skill_focus": "SPEAKING"})
        ws.receive_json()
        ws.send_json({"type": "not_a_real_type"})
        response = ws.receive_json()

    assert response["type"] == "error"
    assert "unknown message type" in response["detail"].lower()


def test_websocket_turn_before_start_returns_error(monkeypatch):
    """A turn message sent before start must not call process_turn with an
    unset clerk_user_id/skill_focus — it must return an error instead."""
    fake_pipeline = AsyncMock()
    monkeypatch.setattr(websocket_handler, "run_turn_pipeline", fake_pipeline)

    client = TestClient(app)
    with client.websocket_connect("/ws/sessions/ws-sess-6") as ws:
        ws.send_json({"type": "turn", "user_message": "hello"})
        response = ws.receive_json()

    assert response["type"] == "error"
    assert "start" in response["detail"].lower()
    fake_pipeline.assert_not_awaited()

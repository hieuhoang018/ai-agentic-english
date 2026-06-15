from __future__ import annotations

import httpx
import pytest
import respx

from agents.agt03_tutor import service


@pytest.fixture(autouse=True)
def reset_session_times():
    service._SESSION_START_TIMES.clear()
    yield
    service._SESSION_START_TIMES.clear()


@respx.mock
async def test_start_session_returns_opening_message_and_emits_event(monkeypatch):
    respx.get(f"{service.AGT01_BASE_URL}/profile/user1").mock(
        return_value=httpx.Response(200, json={"cold_start_flag": True})
    )
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/state").mock(return_value=httpx.Response(204))
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(204))

    emitted = []

    async def fake_emit(topic, payload, agent_id, key=None):
        emitted.append((topic, payload, agent_id))

    monkeypatch.setattr(service, "emit", fake_emit)

    result = await service.start_session("user1", "SPEAKING", "abc")

    assert result["session_id"] == "abc"
    assert result["skill_focus"] == "SPEAKING"
    assert result["opening_message"]
    assert result["cold_start_flag"] is True
    assert emitted[0][0] == "agent.session.start"
    assert emitted[0][1] == {"sessionId": "abc", "clerkUserId": "user1", "skillFocus": "SPEAKING"}


@respx.mock
async def test_start_session_falls_back_when_agt01_unreachable(monkeypatch):
    respx.get(f"{service.AGT01_BASE_URL}/profile/user2").mock(side_effect=httpx.ConnectError("refused"))
    respx.post(f"{service.AGT06_BASE_URL}/sessions/xyz/state").mock(return_value=httpx.Response(204))
    respx.post(f"{service.AGT06_BASE_URL}/sessions/xyz/context").mock(return_value=httpx.Response(204))

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    result = await service.start_session("user2", "speaking", "xyz")

    assert result["skill_focus"] == "SPEAKING"  # uppercased
    assert result["cold_start_flag"] is True


@respx.mock
async def test_process_turn_mock_mode_echoes_user_text(monkeypatch):
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(204))
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(
        return_value=httpx.Response(200, json=[{"role": "user", "content": "Hello, I work in finance."}])
    )

    result = await service.process_turn("abc", "Hello, I work in finance.", None)

    assert result["session_id"] == "abc"
    assert result["transcript_text"] == "Hello, I work in finance."
    assert result["assistant_text"].startswith("[MOCK LLM AGT03]")


@respx.mock
async def test_process_turn_with_audio_uses_asr(monkeypatch):
    import base64

    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(204))
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(200, json=[]))

    audio_b64 = base64.b64encode(b"fake-audio-bytes").decode()

    result = await service.process_turn("abc", None, audio_b64)

    # asr.transcribe in mock mode returns the canned transcription
    assert result["transcript_text"] == "Mock transcription of user speech."


@respx.mock
async def test_end_session_consolidates_and_emits_event(monkeypatch):
    service._SESSION_START_TIMES["abc"] = service.time.monotonic() - 60  # started 1 minute ago

    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/consolidate").mock(
        return_value=httpx.Response(200, json={"consolidated": True, "session_id": "abc"})
    )

    emitted = []

    async def fake_emit(topic, payload, agent_id, key=None):
        emitted.append((topic, payload, agent_id))

    monkeypatch.setattr(service, "emit", fake_emit)

    result = await service.end_session("abc", "user1", "speaking")

    assert result["session_id"] == "abc"
    assert result["consolidated"] is True
    assert result["duration_minutes"] > 0

    assert emitted[0][0] == "agent.session.end"
    assert emitted[0][1]["sessionId"] == "abc"
    assert emitted[0][1]["clerkUserId"] == "user1"
    assert emitted[0][1]["skillFocus"] == "SPEAKING"
    assert emitted[0][1]["durationMinutes"] > 0


@respx.mock
async def test_end_session_handles_agt06_unreachable(monkeypatch):
    service._SESSION_START_TIMES["abc"] = service.time.monotonic() - 30

    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/consolidate").mock(side_effect=httpx.ConnectError("refused"))

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    result = await service.end_session("abc", "user1", "SPEAKING")

    assert result["consolidated"] is False
    assert result["duration_minutes"] > 0


@respx.mock
async def test_get_session_state_returns_none_on_404():
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/state").mock(return_value=httpx.Response(404))

    result = await service.get_session_state("abc")

    assert result == {"session_id": "abc", "state": None}

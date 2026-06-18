from __future__ import annotations

import httpx
import pytest
import respx

from agents.agt03_tutor import service


@pytest.fixture(autouse=True)
def reset_session_state():
    service._SESSION_START_TIMES.clear()
    service._SESSION_TURN_COUNTS.clear()
    yield
    service._SESSION_START_TIMES.clear()
    service._SESSION_TURN_COUNTS.clear()


@respx.mock
async def test_start_session_returns_opening_message_and_emits_event(monkeypatch):
    respx.get(f"{service.AGT01_BASE_URL}/profile/user1").mock(
        return_value=httpx.Response(200, json={"cold_start_flag": False})
    )
    respx.get(f"{service.AGT02_BASE_URL}/plans/user1/active").mock(
        return_value=httpx.Response(200, json={"lm_plan_id": "plan1"})
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
    assert result["profile_loaded"] is True
    assert result["plan_loaded"] is True
    assert emitted[0][0] == "session.start"
    assert emitted[0][1] == {"sessionId": "abc", "clerkUserId": "user1", "skillFocus": "SPEAKING"}


@respx.mock
async def test_start_session_profile_loaded_false_when_agt01_unreachable(monkeypatch):
    respx.get(f"{service.AGT01_BASE_URL}/profile/user2").mock(side_effect=httpx.ConnectError("refused"))
    respx.get(f"{service.AGT02_BASE_URL}/plans/user2/active").mock(
        return_value=httpx.Response(200, json={"lm_plan_id": "plan2"})
    )
    respx.post(f"{service.AGT06_BASE_URL}/sessions/xyz/state").mock(return_value=httpx.Response(204))
    respx.post(f"{service.AGT06_BASE_URL}/sessions/xyz/context").mock(return_value=httpx.Response(204))

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    result = await service.start_session("user2", "speaking", "xyz")

    assert result["skill_focus"] == "SPEAKING"
    assert result["profile_loaded"] is False
    assert result["plan_loaded"] is True


@respx.mock
async def test_start_session_plan_loaded_false_when_agt02_unreachable(monkeypatch):
    respx.get(f"{service.AGT01_BASE_URL}/profile/user3").mock(
        return_value=httpx.Response(200, json={"cold_start_flag": False})
    )
    respx.get(f"{service.AGT02_BASE_URL}/plans/user3/active").mock(
        side_effect=httpx.ConnectError("refused")
    )
    respx.post(f"{service.AGT06_BASE_URL}/sessions/sess3/state").mock(return_value=httpx.Response(204))
    respx.post(f"{service.AGT06_BASE_URL}/sessions/sess3/context").mock(return_value=httpx.Response(204))

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    result = await service.start_session("user3", "SPEAKING", "sess3")

    assert result["profile_loaded"] is True
    assert result["plan_loaded"] is False


@respx.mock
async def test_start_session_plan_loaded_false_when_no_active_plan(monkeypatch):
    respx.get(f"{service.AGT01_BASE_URL}/profile/user4").mock(
        return_value=httpx.Response(200, json={"cold_start_flag": True})
    )
    respx.get(f"{service.AGT02_BASE_URL}/plans/user4/active").mock(
        return_value=httpx.Response(404)
    )
    respx.post(f"{service.AGT06_BASE_URL}/sessions/sess4/state").mock(return_value=httpx.Response(204))
    respx.post(f"{service.AGT06_BASE_URL}/sessions/sess4/context").mock(return_value=httpx.Response(204))

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    result = await service.start_session("user4", "WRITING", "sess4")

    assert result["profile_loaded"] is True
    assert result["plan_loaded"] is False


@respx.mock
async def test_process_turn_mock_mode_echoes_user_message(monkeypatch):
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(204))
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(
        return_value=httpx.Response(200, json=[{"role": "user", "content": "Hello, I work in finance."}])
    )

    result = await service.process_turn("abc", "Hello, I work in finance.", None)

    assert result["session_id"] == "abc"
    assert result["transcript_text"] == "Hello, I work in finance."
    assert result["assistant_message"].startswith("[MOCK LLM AGT03]")
    assert result["language"] == "en"
    assert result["mock_feedback"] is not None


@respx.mock
async def test_process_turn_with_audio_uses_asr(monkeypatch):
    import base64

    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(204))
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(200, json=[]))

    audio_b64 = base64.b64encode(b"fake-audio-bytes").decode()

    result = await service.process_turn("abc", None, audio_b64)

    assert result["transcript_text"] == "Mock transcription of user speech."


@respx.mock
async def test_process_turn_increments_turn_count(monkeypatch):
    service._SESSION_TURN_COUNTS["abc"] = 0

    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(204))
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(200, json=[]))

    await service.process_turn("abc", "first message", None)
    await service.process_turn("abc", "second message", None)

    assert service._SESSION_TURN_COUNTS["abc"] == 2


@respx.mock
async def test_end_session_consolidates_and_emits_event(monkeypatch):
    service._SESSION_START_TIMES["abc"] = service.time.monotonic() - 60
    service._SESSION_TURN_COUNTS["abc"] = 3

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
    assert result["turns_completed"] == 3

    assert emitted[0][0] == "session.end"
    assert emitted[0][1]["sessionId"] == "abc"
    assert emitted[0][1]["clerkUserId"] == "user1"
    assert emitted[0][1]["skillFocus"] == "SPEAKING"
    assert emitted[0][1]["durationMinutes"] > 0


@respx.mock
async def test_end_session_handles_agt06_unreachable(monkeypatch):
    service._SESSION_START_TIMES["abc"] = service.time.monotonic() - 30
    service._SESSION_TURN_COUNTS["abc"] = 1

    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/consolidate").mock(side_effect=httpx.ConnectError("refused"))

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    result = await service.end_session("abc", "user1", "SPEAKING")

    assert result["consolidated"] is False
    assert result["duration_minutes"] > 0
    assert result["turns_completed"] == 1


@respx.mock
async def test_get_session_state_returns_none_on_404():
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/state").mock(return_value=httpx.Response(404))

    result = await service.get_session_state("abc")

    assert result == {"session_id": "abc", "state": None}


@respx.mock
async def test_end_session_double_call_does_not_emit_twice(monkeypatch):
    """Second end_session call must NOT emit session.end again."""
    service._SESSION_START_TIMES["abc"] = service.time.monotonic() - 60
    service._SESSION_TURN_COUNTS["abc"] = 2

    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/consolidate").mock(
        return_value=httpx.Response(200, json={"consolidated": True, "session_id": "abc"})
    )

    emitted = []

    async def fake_emit(topic, payload, agent_id, key=None):
        emitted.append((topic, payload))

    monkeypatch.setattr(service, "emit", fake_emit)

    await service.end_session("abc", "user1", "SPEAKING")
    await service.end_session("abc", "user1", "SPEAKING")  # double call

    assert len([e for e in emitted if e[0] == "session.end"]) == 1, (
        "session.end must only be emitted once even if end_session is called twice"
    )


async def test_process_turn_raises_when_no_message_and_no_audio():
    """Both user_message=None and audio_base64=None must raise ValueError."""
    with pytest.raises(ValueError, match="requires either user_message or audio_base64"):
        await service.process_turn("abc", None, None)


@respx.mock
async def test_stm_set_state_http_error_propagates_to_start_session(monkeypatch):
    """AGT-06 returning 500 on /state must cause start_session to raise, not silently succeed."""
    respx.get(f"{service.AGT01_BASE_URL}/profile/user5").mock(
        return_value=httpx.Response(200, json={"cold_start_flag": False})
    )
    respx.get(f"{service.AGT02_BASE_URL}/plans/user5/active").mock(
        return_value=httpx.Response(200, json={"lm_plan_id": "plan5"})
    )
    respx.post(f"{service.AGT06_BASE_URL}/sessions/sess5/state").mock(
        return_value=httpx.Response(500, json={"detail": "Redis unavailable"})
    )

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    with pytest.raises(httpx.HTTPStatusError):
        await service.start_session("user5", "SPEAKING", "sess5")

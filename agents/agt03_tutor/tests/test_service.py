from __future__ import annotations

import json

import httpx
import pytest
import respx

from agents.agt03_tutor import service


def _mock_session_meta(respx_mock, session_id: str, *, clerk_user_id: str = "user1",
                        skill_focus: str = "SPEAKING", profile: dict | None = None,
                        turn_count: int = 0):
    """Mock AGT-06's session-meta GET endpoint to simulate an active session."""
    from datetime import datetime, timezone
    meta = {
        "start_time": datetime.now(timezone.utc).isoformat(),
        "clerk_user_id": clerk_user_id,
        "skill_focus": skill_focus,
        "profile": profile or {},
        "profile_loaded": True,
    }
    respx_mock.get(f"{service.AGT06_BASE_URL}/sessions/{session_id}/meta").mock(
        return_value=httpx.Response(200, json=meta)
    )
    respx_mock.post(f"{service.AGT06_BASE_URL}/sessions/{session_id}/meta/increment-turn").mock(
        return_value=httpx.Response(200, json={"turn_count": turn_count + 1})
    )
    respx_mock.get(f"{service.AGT06_BASE_URL}/sessions/{session_id}/meta/turn-count").mock(
        return_value=httpx.Response(200, json={"turn_count": turn_count})
    )
    respx_mock.delete(f"{service.AGT06_BASE_URL}/sessions/{session_id}/meta").mock(
        return_value=httpx.Response(204)
    )
    return meta


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
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/meta").mock(return_value=httpx.Response(204))

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
    respx.post(f"{service.AGT06_BASE_URL}/sessions/xyz/meta").mock(return_value=httpx.Response(204))

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
    respx.post(f"{service.AGT06_BASE_URL}/sessions/sess3/meta").mock(return_value=httpx.Response(204))

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
    respx.post(f"{service.AGT06_BASE_URL}/sessions/sess4/meta").mock(return_value=httpx.Response(204))

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

    _mock_session_meta(respx, "abc")

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

    _mock_session_meta(respx, "abc")

    audio_b64 = base64.b64encode(b"fake-audio-bytes").decode()

    result = await service.process_turn("abc", None, audio_b64)

    assert result["transcript_text"] == "Mock transcription of user speech."


@respx.mock
async def test_process_turn_increments_turn_count(monkeypatch):
    turn_calls: list[int] = []

    def _next_turn_response(request):
        turn_calls.append(1)
        return httpx.Response(200, json={"turn_count": len(turn_calls)})

    _mock_session_meta(respx, "abc")
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/meta/increment-turn").mock(
        side_effect=_next_turn_response
    )
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(204))
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(200, json=[]))

    await service.process_turn("abc", "first message", None)
    await service.process_turn("abc", "second message", None)

    assert len(turn_calls) == 2, "increment-turn endpoint must be called once per process_turn call"


@respx.mock
async def test_end_session_consolidates_and_emits_event(monkeypatch):
    from datetime import datetime, timezone, timedelta
    past_start = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/meta").mock(
        return_value=httpx.Response(200, json={
            "start_time": past_start, "clerk_user_id": "user1",
            "skill_focus": "SPEAKING", "profile": {}, "profile_loaded": True,
        })
    )
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/meta/turn-count").mock(
        return_value=httpx.Response(200, json={"turn_count": 3})
    )
    respx.delete(f"{service.AGT06_BASE_URL}/sessions/abc/meta").mock(return_value=httpx.Response(204))

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
    from datetime import datetime, timezone, timedelta
    past_start = (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat()
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/meta").mock(
        return_value=httpx.Response(200, json={
            "start_time": past_start, "clerk_user_id": "user1",
            "skill_focus": "SPEAKING", "profile": {}, "profile_loaded": True,
        })
    )
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/meta/turn-count").mock(
        return_value=httpx.Response(200, json={"turn_count": 1})
    )
    respx.delete(f"{service.AGT06_BASE_URL}/sessions/abc/meta").mock(return_value=httpx.Response(204))

    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/consolidate").mock(side_effect=httpx.ConnectError("refused"))

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    result = await service.end_session("abc", "user1", "SPEAKING")

    assert result["consolidated"] is False
    assert result["duration_minutes"] > 0
    assert result["turns_completed"] == 1


@respx.mock
async def test_end_session_handles_naive_start_time_without_crashing(monkeypatch):
    """If AGT-06 session meta somehow holds a naive (no-tz) or malformed start_time
    (e.g. written by an unvalidated caller of POST /sessions/{id}/meta), end_session
    must degrade gracefully instead of raising ValueError/TypeError."""
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/meta").mock(
        return_value=httpx.Response(200, json={
            "start_time": "2026-07-01T10:00:00",  # naive — no timezone offset
            "clerk_user_id": "user1",
            "skill_focus": "SPEAKING", "profile": {}, "profile_loaded": True,
        })
    )
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/meta/turn-count").mock(
        return_value=httpx.Response(200, json={"turn_count": 2})
    )
    respx.delete(f"{service.AGT06_BASE_URL}/sessions/abc/meta").mock(return_value=httpx.Response(204))
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/consolidate").mock(
        return_value=httpx.Response(200, json={"consolidated": True, "session_id": "abc"})
    )

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    result = await service.end_session("abc", "user1", "SPEAKING")

    # Naive datetime is treated as UTC rather than crashing — duration is computed
    # normally (not forced to 0.0) since the parse itself succeeds.
    assert isinstance(result["duration_minutes"], float)
    assert result["session_id"] == "abc"


@respx.mock
async def test_end_session_handles_invalid_start_time_string(monkeypatch):
    """An outright invalid start_time string must not crash end_session — it
    should fall back to the same degraded path as a missing start_time."""
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/meta").mock(
        return_value=httpx.Response(200, json={
            "start_time": "not-a-date",
            "clerk_user_id": "user1",
            "skill_focus": "SPEAKING", "profile": {}, "profile_loaded": True,
        })
    )
    respx.delete(f"{service.AGT06_BASE_URL}/sessions/abc/meta").mock(return_value=httpx.Response(204))
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/consolidate").mock(
        return_value=httpx.Response(200, json={"consolidated": True, "session_id": "abc"})
    )

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    result = await service.end_session("abc", "user1", "SPEAKING")

    assert result["duration_minutes"] == 0.0
    assert result["turns_completed"] == 0
    assert result["session_id"] == "abc"


@respx.mock
async def test_get_session_state_returns_none_on_404():
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/state").mock(return_value=httpx.Response(404))

    result = await service.get_session_state("abc")

    assert result == {"session_id": "abc", "state": None}


@respx.mock
async def test_end_session_double_call_does_not_emit_twice(monkeypatch):
    """Second end_session call must NOT emit session.end again."""
    from datetime import datetime, timezone, timedelta
    past_start = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
    meta_responses = [
        httpx.Response(200, json={
            "start_time": past_start, "clerk_user_id": "user1",
            "skill_focus": "SPEAKING", "profile": {}, "profile_loaded": True,
        }),
        httpx.Response(404),  # second end_session call: meta already deleted
    ]
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/meta").mock(side_effect=meta_responses)
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/meta/turn-count").mock(
        return_value=httpx.Response(200, json={"turn_count": 2})
    )
    respx.delete(f"{service.AGT06_BASE_URL}/sessions/abc/meta").mock(return_value=httpx.Response(204))

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
async def test_process_turn_raises_for_unknown_session():
    """process_turn must raise ValueError when AGT-06 has no meta for this session."""
    respx.get(f"{service.AGT06_BASE_URL}/sessions/dead-session/meta").mock(
        return_value=httpx.Response(404)
    )

    with pytest.raises(ValueError, match="not active"):
        await service.process_turn("dead-session", "hello", None)


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


@respx.mock
async def test_process_turn_system_prompt_includes_profile_data(monkeypatch):
    """The LLM call in live mode must include profile context in the system prompt."""
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(204))
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(
        return_value=httpx.Response(200, json=[])
    )

    # Simulate a session that was started with a real profile
    _mock_session_meta(respx, "abc", clerk_user_id="user_live", skill_focus="SPEAKING", profile={
        "irt_theta": {"L": 0.2, "S": 0.8, "R": 0.5, "W": 0.3},
        "grammar_error_map": {"SPEAKING": {"verb_tense": 3.0}},
        "cold_start_flag": False,
    })

    captured_messages = []

    async def fake_call_llm(messages, agent_id):
        captured_messages.extend(messages)
        return "Good job!"

    monkeypatch.setattr(service, "call_llm", fake_call_llm)

    from agents.shared.config import settings as cfg
    monkeypatch.setattr(cfg, "INFERENCE_MODE", "live")

    await service.process_turn("abc", "Hello, I work in finance.", None)

    system_content = next(m["content"] for m in captured_messages if m["role"] == "system")
    assert "verb_tense" in system_content or "SPEAKING" in system_content, (
        "System prompt must mention dominant error types from the profile"
    )


# ---------------------------------------------------------------------------
# AGT-04 grammar feedback integration
# ---------------------------------------------------------------------------

@respx.mock
async def test_process_turn_includes_grammar_feedback_from_agt04():
    """process_turn must call AGT-04 and include its response in grammar_feedback."""
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(204))
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(
        return_value=httpx.Response(200, json=[])
    )

    agt04_response = {
        "grammar_errors": [{"errorType": "verb_tense", "severity": 2}],
        "fluency": {"wpm": 120},
        "throttled": False,
        "total_errors_detected": 1,
        "surfaced_error_count": 1,
    }
    respx.post(f"{service.AGT04_BASE_URL}/feedback/speaking").mock(
        return_value=httpx.Response(200, json=agt04_response)
    )
    respx.post(f"{service.AGT11_BASE_URL}/translate").mock(
        return_value=httpx.Response(200, json={
            "original": "test", "translated": "test", "zone": "en_only",
            "zone_label": "English only (above B2)", "theta_r": 2.0, "cached": False,
        })
    )

    _mock_session_meta(respx, "abc", clerk_user_id="user_fb", skill_focus="SPEAKING")

    result = await service.process_turn("abc", "I go there yesterday.", None)

    assert result["grammar_feedback"] is not None
    assert result["grammar_feedback"]["total_errors_detected"] == 1
    assert result["grammar_feedback"]["grammar_errors"][0]["errorType"] == "verb_tense"


@respx.mock
async def test_process_turn_grammar_feedback_none_when_agt04_fails():
    """If AGT-04 is unreachable, process_turn must complete with grammar_feedback=None."""
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(204))
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.post(f"{service.AGT04_BASE_URL}/feedback/speaking").mock(
        side_effect=httpx.ConnectError("AGT-04 down")
    )
    respx.post(f"{service.AGT11_BASE_URL}/translate").mock(
        side_effect=httpx.ConnectError("AGT-11 down")
    )

    _mock_session_meta(respx, "abc", clerk_user_id="user_fb", skill_focus="SPEAKING")

    result = await service.process_turn("abc", "I go there yesterday.", None)

    assert result["grammar_feedback"] is None
    assert result["assistant_message"].startswith("[MOCK LLM AGT03]")


@respx.mock
async def test_process_turn_reading_skill_skips_agt04():
    """READING sessions must return grammar_feedback=None (comprehension path, not grammar)."""
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(204))
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.post(f"{service.AGT11_BASE_URL}/translate").mock(
        return_value=httpx.Response(200, json={
            "original": "test", "translated": "[VI] test", "zone": "vi_primary",
            "zone_label": "Vietnamese primary (below B1)", "theta_r": -1.0, "cached": False,
        })
    )

    _mock_session_meta(respx, "abc", clerk_user_id="user_read", skill_focus="READING")

    result = await service.process_turn("abc", "I understood the text.", None)

    assert result["grammar_feedback"] is None


# ---------------------------------------------------------------------------
# AGT-11 translation integration
# ---------------------------------------------------------------------------

@respx.mock
async def test_process_turn_includes_translation_for_vi_primary_user():
    """For vi_primary zone, translated_message must contain the AGT-11 translation."""
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(204))
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.post(f"{service.AGT04_BASE_URL}/feedback/writing").mock(
        return_value=httpx.Response(200, json={"grammar_errors": [], "total_errors": 0})
    )
    respx.post(f"{service.AGT11_BASE_URL}/translate").mock(
        return_value=httpx.Response(200, json={
            "original": "[MOCK LLM AGT03] Got it",
            "translated": "[VI] Được rồi!",
            "zone": "vi_primary",
            "zone_label": "Vietnamese primary (below B1)",
            "theta_r": -1.0,
            "cached": False,
        })
    )

    _mock_session_meta(respx, "abc", clerk_user_id="user_vi", skill_focus="WRITING")

    result = await service.process_turn("abc", "Dear manager, I writing to...", None)

    assert result["translated_message"] == "[VI] Được rồi!"
    assert result["translation_zone"] == "vi_primary"


@respx.mock
async def test_process_turn_speaking_session_returns_en_only_zone():
    """SPEAKING sessions use session_type=conversation → AGT-11 returns en_only → no translation."""
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(204))
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.post(f"{service.AGT04_BASE_URL}/feedback/speaking").mock(
        return_value=httpx.Response(200, json={"grammar_errors": [], "total_errors_detected": 0, "surfaced_error_count": 0, "throttled": False, "fluency": {}})
    )
    respx.post(f"{service.AGT11_BASE_URL}/translate").mock(
        return_value=httpx.Response(200, json={
            "original": "Good!", "translated": "Good!", "zone": "en_only",
            "zone_label": "English only (above B2)", "theta_r": 2.0, "cached": False,
        })
    )

    _mock_session_meta(respx, "abc", clerk_user_id="user_speak", skill_focus="SPEAKING")

    result = await service.process_turn("abc", "I work in marketing.", None)

    assert result["translated_message"] is None
    assert result["translation_zone"] == "en_only"


@respx.mock
async def test_process_turn_translation_none_when_agt11_fails():
    """If AGT-11 is unreachable, translated_message and translation_zone must both be None."""
    respx.post(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(return_value=httpx.Response(204))
    respx.get(f"{service.AGT06_BASE_URL}/sessions/abc/context").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.post(f"{service.AGT04_BASE_URL}/feedback/speaking").mock(
        side_effect=httpx.ConnectError("AGT-04 down")
    )
    respx.post(f"{service.AGT11_BASE_URL}/translate").mock(
        side_effect=httpx.ConnectError("AGT-11 down")
    )

    _mock_session_meta(respx, "abc", clerk_user_id="user_fail", skill_focus="SPEAKING")

    result = await service.process_turn("abc", "Hello there.", None)

    assert result["translated_message"] is None
    assert result["translation_zone"] is None


# ---------------------------------------------------------------------------
# start_session stores clerk_user_id in session profiles
# ---------------------------------------------------------------------------

@respx.mock
async def test_start_session_stores_clerk_user_id(monkeypatch):
    """clerk_user_id must be persisted to AGT-06 session meta so process_turn can use it."""
    respx.get(f"{service.AGT01_BASE_URL}/profile/user_ck").mock(
        return_value=httpx.Response(200, json={"cold_start_flag": False})
    )
    respx.get(f"{service.AGT02_BASE_URL}/plans/user_ck/active").mock(
        return_value=httpx.Response(404)
    )
    respx.post(f"{service.AGT06_BASE_URL}/sessions/ck_sess/state").mock(return_value=httpx.Response(204))
    respx.post(f"{service.AGT06_BASE_URL}/sessions/ck_sess/context").mock(return_value=httpx.Response(204))
    meta_route = respx.post(f"{service.AGT06_BASE_URL}/sessions/ck_sess/meta").mock(
        return_value=httpx.Response(204)
    )

    async def fake_emit(topic, payload, agent_id, key=None):
        pass

    monkeypatch.setattr(service, "emit", fake_emit)

    await service.start_session("user_ck", "SPEAKING", "ck_sess")

    assert meta_route.called
    sent_body = json.loads(meta_route.calls.last.request.content)
    assert sent_body["clerk_user_id"] == "user_ck"


# ---------------------------------------------------------------------------
# TurnRequest model contract
# ---------------------------------------------------------------------------

def test_turn_request_clerk_user_id_is_optional():
    """TurnRequest must accept calls without clerk_user_id.
    The field is unused by process_turn and was erroneously required,
    causing 422 on any caller following the documented API."""
    from agents.agt03_tutor.models import TurnRequest
    req = TurnRequest(session_id="sess-abc", user_message="hello world")
    assert req.clerk_user_id is None
    assert req.session_id == "sess-abc"
    assert req.user_message == "hello world"


def test_turn_request_accepts_audio_without_text():
    from agents.agt03_tutor.models import TurnRequest
    req = TurnRequest(session_id="sess-abc", audio_base64="base64==")
    assert req.user_message is None
    assert req.audio_base64 == "base64=="


def test_turn_request_clerk_user_id_still_accepted_when_provided():
    from agents.agt03_tutor.models import TurnRequest
    req = TurnRequest(session_id="sess-abc", clerk_user_id="user-1", user_message="hi")
    assert req.clerk_user_id == "user-1"

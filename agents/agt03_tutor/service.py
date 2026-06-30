"""
AGT-03 AI Tutor — text-only conversation orchestration for this sprint.

Session lifecycle:
  start_session: fetch the merged learner profile from AGT-01 (best-effort —
    falls back to profile_loaded=False on failure), fetch the active plan from
    AGT-02 (best-effort — plan_loaded=False on failure or 404), initialise STM
    session state on AGT-06 (critical path — raises on failure), produce an
    opening message (canned per skill_focus in mock mode), append it to STM
    context, and emit session.start.

  process_turn: optionally transcribe audio via asr.transcribe (already
    implemented, unchanged), append the user turn to STM context, call the
    LLM router for a reply (canned echo in mock mode), append the assistant
    turn to STM context.

  end_session: compute session duration, trigger AGT-06 consolidation
    (idempotent), and emit session.end with durationMinutes — this is
    what AGT-01's handle_session_end consumer reacts to.

pipeline.py and websocket_handler.py remain stubs this sprint; main.py calls
this module directly over plain HTTP endpoints. process_turn calls AGT-04
(grammar feedback) and AGT-11 (translation) concurrently via asyncio.gather,
both best-effort — failures return None and never block the turn response.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import uuid
from datetime import datetime, timezone

import httpx

from agents.shared.config import settings
from agents.shared.events.producer import emit
from agents.shared.llm.router import call_llm, AgentID
from agents.agt03_tutor import asr

logger = logging.getLogger(__name__)

AGT06_BASE_URL = os.environ.get("AGT06_BASE_URL", "http://agt06-memory:8106")
AGT01_BASE_URL = os.environ.get("AGT01_BASE_URL", "http://agt01-profiling:8101")
AGT02_BASE_URL = os.environ.get("AGT02_BASE_URL", "http://agt02-learning-path:8102")
AGT04_BASE_URL = os.environ.get("AGT04_BASE_URL", "http://agt04-feedback:8104")
AGT11_BASE_URL = os.environ.get("AGT11_BASE_URL", "http://agt11-translation:8111")

_OPENING_MESSAGES: dict[str, str] = {
    "LISTENING": "Hi! Today we'll practice listening. I'll describe a short workplace scenario - let me know if you'd like me to repeat anything.",
    "SPEAKING": "Hi! Let's practice speaking. Tell me about a typical task you handle at work, and I'll ask follow-up questions.",
    "READING": "Hi! Today we'll work on reading comprehension using a short workplace passage. Ready when you are.",
    "WRITING": "Hi! Let's practice writing. I'll give you a short prompt and we can refine your draft together.",
}


async def _stm_set_state(session_id: str, skill_focus: str) -> None:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            f"{AGT06_BASE_URL}/sessions/{session_id}/state",
            json={"skill_focus": skill_focus, "phase": "warm_up"},
        )
        resp.raise_for_status()  # critical path — non-2xx must propagate


async def _stm_append_context(session_id: str, role: str, content: str) -> None:
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(
            f"{AGT06_BASE_URL}/sessions/{session_id}/context",
            json={"role": role, "content": content},
        )


async def _stm_get_context(session_id: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{AGT06_BASE_URL}/sessions/{session_id}/context")
        resp.raise_for_status()
        return resp.json()


async def _stm_set_meta(session_id: str, meta: dict) -> None:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(f"{AGT06_BASE_URL}/sessions/{session_id}/meta", json=meta)
        resp.raise_for_status()


async def _stm_get_meta(session_id: str) -> dict | None:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{AGT06_BASE_URL}/sessions/{session_id}/meta")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()


async def _stm_delete_meta(session_id: str) -> None:
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.delete(f"{AGT06_BASE_URL}/sessions/{session_id}/meta")


async def _stm_incr_turn(session_id: str) -> int:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(f"{AGT06_BASE_URL}/sessions/{session_id}/meta/increment-turn")
        resp.raise_for_status()
        return resp.json()["turn_count"]


async def _stm_get_turn_count(session_id: str) -> int:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{AGT06_BASE_URL}/sessions/{session_id}/meta/turn-count")
        resp.raise_for_status()
        return resp.json()["turn_count"]


async def _fetch_profile(clerk_user_id: str, session_id: str) -> tuple[dict, bool]:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{AGT01_BASE_URL}/profile/{clerk_user_id}",
                params={"session_id": session_id},
            )
            resp.raise_for_status()
            return resp.json(), True
    except Exception as exc:
        logger.warning("start_session: AGT-01 profile fetch failed for %s: %s", clerk_user_id, exc)
        return {"cold_start_flag": True}, False


async def _fetch_grammar_feedback(
    transcript: str,
    session_id: str,
    clerk_user_id: str,
    skill_focus: str,
) -> dict | None:
    """
    Call AGT-04 for grammar/fluency feedback. Best-effort — returns None on failure.
    READING sessions skip feedback (comprehension scoring is a separate stub endpoint).
    SPEAKING and LISTENING → /feedback/speaking; WRITING → /feedback/writing.
    """
    if skill_focus == "READING":
        return None

    endpoint = "speaking" if skill_focus in {"SPEAKING", "LISTENING"} else "writing"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            if endpoint == "speaking":
                payload = {
                    "transcript": transcript,
                    "session_id": session_id,
                    "clerk_user_id": clerk_user_id,
                    "duration_seconds": 0.0,
                    "skill_domain": skill_focus,
                }
            else:
                payload = {
                    "draft": transcript,
                    "prompt": "",
                    "session_id": session_id,
                    "clerk_user_id": clerk_user_id,
                }
            r = await client.post(f"{AGT04_BASE_URL}/feedback/{endpoint}", json=payload)
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        logger.warning("process_turn: AGT-04 feedback failed for session=%s: %s", session_id, exc)
        return None


async def _fetch_translation(
    content: str,
    clerk_user_id: str,
    skill_focus: str,
) -> tuple[str | None, str | None]:
    """
    Call AGT-11 to translate the assistant message. Best-effort — returns (None, None) on failure.
    SPEAKING sessions use session_type='conversation' → AGT-11 always returns en_only (immersion).
    Returns (translated_text, zone); translated_text is None when zone is en_only.
    """
    session_type = "conversation" if skill_focus == "SPEAKING" else "exercise"
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.post(
                f"{AGT11_BASE_URL}/translate",
                json={
                    "content": content,
                    "clerk_user_id": clerk_user_id,
                    "session_type": session_type,
                },
            )
            r.raise_for_status()
            data = r.json()
            zone = data.get("zone", "en_only")
            if zone == "en_only":
                return None, zone
            return data.get("translated"), zone
    except Exception as exc:
        logger.warning("process_turn: AGT-11 translation failed for user=%s: %s", clerk_user_id, exc)
        return None, None


async def _fetch_plan(clerk_user_id: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{AGT02_BASE_URL}/plans/{clerk_user_id}/active")
            if resp.status_code == 404:
                return False
            resp.raise_for_status()
            return True
    except Exception as exc:
        logger.warning("start_session: AGT-02 plan fetch failed for %s: %s", clerk_user_id, exc)
        return False


def _build_system_prompt(skill_focus: str, profile: dict) -> str:
    """Build a personalised system prompt from the learner profile."""
    # skill_focus first char maps to theta key: SPEAKING->S, LISTENING->L, etc.
    theta_key = skill_focus[0]
    theta = profile.get("irt_theta") or {}
    skill_level = float(theta.get(theta_key) or 0.0)
    cefr_map = [(1.5, "C2"), (1.0, "C1"), (0.5, "B2"), (0.0, "B1"), (-0.5, "A2")]
    cefr = next((label for threshold, label in cefr_map if skill_level >= threshold), "A1")

    error_map = profile.get("grammar_error_map") or {}
    skill_errors = error_map.get(skill_focus, {})
    top_errors = sorted(skill_errors.items(), key=lambda x: x[1], reverse=True)[:3]
    error_str = (
        ", ".join(f"{k} ({v:.0f})" for k, v in top_errors)
        if top_errors else "none identified yet"
    )

    cold_start = profile.get("cold_start_flag", True)
    experience = "new learner" if cold_start else "returning learner"

    return (
        f"You are an English tutor for a Vietnamese working professional. "
        f"This is a {experience}. Skill focus today: {skill_focus}. "
        f"Current {skill_focus} level: {cefr}. "
        f"Top grammar issues in {skill_focus}: {error_str}. "
        f"Keep replies concise (2-4 sentences) and ask one follow-up question."
    )


async def start_session(clerk_user_id: str, skill_focus: str, session_id: str | None = None) -> dict:
    session_id = session_id or str(uuid.uuid4())
    skill_focus = skill_focus.upper()

    _profile, profile_loaded = await _fetch_profile(clerk_user_id, session_id)
    plan_loaded = await _fetch_plan(clerk_user_id)

    # Critical path: raises if AGT-06 STM is unavailable.
    await _stm_set_state(session_id, skill_focus)

    opening = _OPENING_MESSAGES.get(skill_focus, _OPENING_MESSAGES["SPEAKING"])
    if settings.INFERENCE_MODE != "mock":
        messages = [
            {"role": "system", "content": f"You are an English tutor for a Vietnamese working professional. Skill focus: {skill_focus}."},
            {"role": "user", "content": "Start the lesson with a short greeting and an opening question."},
        ]
        opening = await call_llm(messages, AgentID.AGT03)

    try:
        await _stm_append_context(session_id, "assistant", opening)
    except Exception as exc:
        logger.warning("start_session: AGT-06 append_context failed for %s: %s", session_id, exc)

    # Critical: wall-clock time, not time.monotonic() — this value is read back
    # by a potentially different process (or the same process after a restart).
    await _stm_set_meta(session_id, {
        "start_time": datetime.now(timezone.utc).isoformat(),
        "clerk_user_id": clerk_user_id,
        "skill_focus": skill_focus,
        "profile": _profile,
        "profile_loaded": profile_loaded,
    })

    await emit(
        "session.start",
        {"sessionId": session_id, "clerkUserId": clerk_user_id, "skillFocus": skill_focus},
        agent_id="AGT03",
    )

    return {
        "session_id": session_id,
        "clerk_user_id": clerk_user_id,
        "skill_focus": skill_focus,
        "opening_message": opening,
        "profile_loaded": profile_loaded,
        "plan_loaded": plan_loaded,
    }


async def process_turn(session_id: str, user_message: str | None, audio_base64: str | None) -> dict:
    if user_message is None and audio_base64 is None:
        raise ValueError("process_turn requires either user_message or audio_base64")

    session_data = await _stm_get_meta(session_id)
    if session_data is None:
        raise ValueError(
            f"process_turn: session '{session_id}' is not active — "
            "call start_session first or session has already ended"
        )

    transcript_text = user_message

    if audio_base64 is not None:
        audio_bytes = base64.b64decode(audio_base64)
        result = await asr.transcribe(audio_bytes, session_id)
        transcript_text = result.get("text") or ""

    if not transcript_text:
        transcript_text = ""

    try:
        await _stm_append_context(session_id, "user", transcript_text)
    except Exception as exc:
        logger.warning("process_turn: AGT-06 append_context (user) failed for %s: %s", session_id, exc)

    try:
        context = await _stm_get_context(session_id)
    except Exception as exc:
        logger.warning("process_turn: AGT-06 get_context failed for %s: %s", session_id, exc)
        context = []

    clerk_user_id = session_data.get("clerk_user_id", "")
    skill_focus = session_data.get("skill_focus", "SPEAKING")

    mock_feedback: str | None = None
    if settings.INFERENCE_MODE == "mock":
        assistant_message = f"[MOCK LLM AGT03] Got it - you said: {transcript_text[:60]}"
        mock_feedback = "[MOCK] Good attempt! Keep practising."
    else:
        profile = session_data.get("profile", {})
        messages = [{"role": "system", "content": _build_system_prompt(skill_focus, profile)}]
        for turn in context:
            role = "assistant" if turn.get("role") == "assistant" else "user"
            messages.append({"role": role, "content": turn.get("content", "")})
        assistant_message = await call_llm(messages, AgentID.AGT03)

    try:
        await _stm_append_context(session_id, "assistant", assistant_message)
    except Exception as exc:
        logger.warning("process_turn: AGT-06 append_context (assistant) failed for %s: %s", session_id, exc)

    await _stm_incr_turn(session_id)

    # Best-effort AGT-04 grammar feedback and AGT-11 translation run concurrently.
    grammar_feedback, (translated_message, translation_zone) = await asyncio.gather(
        _fetch_grammar_feedback(transcript_text or "", session_id, clerk_user_id, skill_focus),
        _fetch_translation(assistant_message, clerk_user_id, skill_focus),
    )

    return {
        "session_id": session_id,
        "assistant_message": assistant_message,
        "transcript_text": transcript_text,
        "mock_feedback": mock_feedback,
        "language": "en",
        "grammar_feedback": grammar_feedback,
        "translated_message": translated_message,
        "translation_zone": translation_zone,
    }


async def end_session(session_id: str, clerk_user_id: str, skill_focus: str) -> dict:
    session_data = await _stm_get_meta(session_id)
    start_time_iso = session_data.get("start_time") if session_data else None
    if start_time_iso is None:
        logger.warning("end_session: session %s has no meta — already ended or expired", session_id)
        duration_minutes = 0.0
        turns_completed = 0
    else:
        start_dt = datetime.fromisoformat(start_time_iso)
        duration_minutes = round((datetime.now(timezone.utc) - start_dt).total_seconds() / 60.0, 4)
        turns_completed = await _stm_get_turn_count(session_id)

    await _stm_delete_meta(session_id)

    consolidated = False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{AGT06_BASE_URL}/sessions/{session_id}/consolidate",
                json={"clerk_user_id": clerk_user_id, "skill_focus": skill_focus.upper()},
            )
            resp.raise_for_status()
            consolidated = resp.json().get("consolidated", False)
    except Exception as exc:
        logger.warning("end_session: AGT-06 consolidate failed for %s: %s", session_id, exc)

    # Only emit if this invocation actually owned the session (meta was present).
    # Prevents a double-call from publishing a second event with durationMinutes=0.
    if session_data is not None:
        await emit(
            "session.end",
            {
                "sessionId": session_id,
                "clerkUserId": clerk_user_id,
                "skillFocus": skill_focus.upper(),
                "durationMinutes": duration_minutes,
            },
            agent_id="AGT03",
        )

    return {
        "session_id": session_id,
        "consolidated": consolidated,
        "duration_minutes": duration_minutes,
        "turns_completed": turns_completed,
    }


async def get_session_state(session_id: str) -> dict:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{AGT06_BASE_URL}/sessions/{session_id}/state")
        if resp.status_code == 404:
            return {"session_id": session_id, "state": None}
        resp.raise_for_status()
        return {"session_id": session_id, "state": resp.json()}

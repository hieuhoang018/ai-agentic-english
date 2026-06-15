"""
AGT-03 AI Tutor — text-only conversation orchestration for this sprint.

Session lifecycle:
  start_session: fetch the merged learner profile from AGT-01 (best-effort —
    falls back to cold-start on failure), initialise STM session state on
    AGT-06, produce an opening message (canned per skill_focus in mock mode),
    append it to STM context, and emit agent.session.start.

  process_turn: optionally transcribe audio via asr.transcribe (already
    implemented, unchanged), append the user turn to STM context, call the
    LLM router for a reply (canned echo in mock mode), append the assistant
    turn to STM context.

  end_session: compute session duration, trigger AGT-06 consolidation
    (idempotent), and emit agent.session.end with durationMinutes — this is
    what AGT-01's handle_session_end consumer reacts to.

pipeline.py and websocket_handler.py remain stubs this sprint; main.py calls
this module directly over plain HTTP endpoints. AGT-04 (feedback) and AGT-11
(translation) are not called anywhere in this module this sprint.
"""

from __future__ import annotations

import base64
import logging
import os
import time
import uuid

import httpx

from agents.shared.config import settings
from agents.shared.events.producer import emit
from agents.shared.llm.router import call_llm, AgentID
from agents.agt03_tutor import asr

logger = logging.getLogger(__name__)

AGT06_BASE_URL = os.environ.get("AGT06_BASE_URL", "http://agt06-memory:8106")
AGT01_BASE_URL = os.environ.get("AGT01_BASE_URL", "http://agt01-profiling:8101")

_OPENING_MESSAGES: dict[str, str] = {
    "LISTENING": "Hi! Today we'll practice listening. I'll describe a short workplace scenario - let me know if you'd like me to repeat anything.",
    "SPEAKING": "Hi! Let's practice speaking. Tell me about a typical task you handle at work, and I'll ask follow-up questions.",
    "READING": "Hi! Today we'll work on reading comprehension using a short workplace passage. Ready when you are.",
    "WRITING": "Hi! Let's practice writing. I'll give you a short prompt and we can refine your draft together.",
}

# In-process session start-time tracker. Acceptable for a single-instance
# sprint deployment; a future phase will move this into AGT-06 STM state.
_SESSION_START_TIMES: dict[str, float] = {}


async def _stm_set_state(session_id: str, skill_focus: str) -> None:
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(
            f"{AGT06_BASE_URL}/sessions/{session_id}/state",
            json={"skill_focus": skill_focus, "phase": "warm_up"},
        )


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


async def _fetch_profile(clerk_user_id: str, session_id: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{AGT01_BASE_URL}/profile/{clerk_user_id}",
                params={"session_id": session_id},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("start_session: AGT-01 profile fetch failed for %s: %s", clerk_user_id, exc)
        return {"cold_start_flag": True}


async def start_session(clerk_user_id: str, skill_focus: str, session_id: str | None = None) -> dict:
    session_id = session_id or str(uuid.uuid4())
    skill_focus = skill_focus.upper()

    profile = await _fetch_profile(clerk_user_id, session_id)

    try:
        await _stm_set_state(session_id, skill_focus)
    except Exception as exc:
        logger.warning("start_session: AGT-06 set_state failed for %s: %s", session_id, exc)

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

    _SESSION_START_TIMES[session_id] = time.monotonic()

    await emit(
        "agent.session.start",
        {"sessionId": session_id, "clerkUserId": clerk_user_id, "skillFocus": skill_focus},
        agent_id="AGT03",
    )

    return {
        "session_id": session_id,
        "clerk_user_id": clerk_user_id,
        "skill_focus": skill_focus,
        "opening_message": opening,
        "cold_start_flag": profile.get("cold_start_flag", True),
    }


async def process_turn(session_id: str, user_text: str | None, audio_base64: str | None) -> dict:
    transcript_text = user_text

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

    if settings.INFERENCE_MODE == "mock":
        assistant_text = f"[MOCK LLM AGT03] Got it - you said: {transcript_text[:60]}"
    else:
        messages = [{"role": "system", "content": "You are an English tutor for a Vietnamese working professional. Keep replies short and ask a follow-up question."}]
        for turn in context:
            role = "assistant" if turn.get("role") == "assistant" else "user"
            messages.append({"role": role, "content": turn.get("content", "")})
        assistant_text = await call_llm(messages, AgentID.AGT03)

    try:
        await _stm_append_context(session_id, "assistant", assistant_text)
    except Exception as exc:
        logger.warning("process_turn: AGT-06 append_context (assistant) failed for %s: %s", session_id, exc)

    return {
        "session_id": session_id,
        "assistant_text": assistant_text,
        "transcript_text": transcript_text,
    }


async def end_session(session_id: str, clerk_user_id: str, skill_focus: str) -> dict:
    start_time = _SESSION_START_TIMES.pop(session_id, None)
    duration_minutes = round((time.monotonic() - start_time) / 60.0, 4) if start_time else 0.0

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

    await emit(
        "agent.session.end",
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
    }


async def get_session_state(session_id: str) -> dict:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{AGT06_BASE_URL}/sessions/{session_id}/state")
        if resp.status_code == 404:
            return {"session_id": session_id, "state": None}
        resp.raise_for_status()
        return {"session_id": session_id, "state": resp.json()}

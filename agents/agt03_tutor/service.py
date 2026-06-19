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
AGT02_BASE_URL = os.environ.get("AGT02_BASE_URL", "http://agt02-learning-path:8102")

_OPENING_MESSAGES: dict[str, str] = {
    "LISTENING": "Hi! Today we'll practice listening. I'll describe a short workplace scenario - let me know if you'd like me to repeat anything.",
    "SPEAKING": "Hi! Let's practice speaking. Tell me about a typical task you handle at work, and I'll ask follow-up questions.",
    "READING": "Hi! Today we'll work on reading comprehension using a short workplace passage. Ready when you are.",
    "WRITING": "Hi! Let's practice writing. I'll give you a short prompt and we can refine your draft together.",
}

# In-process session trackers. Acceptable for a single-instance sprint
# deployment; a future phase will move these into AGT-06 STM state.
_SESSION_START_TIMES: dict[str, float] = {}
_SESSION_TURN_COUNTS: dict[str, int] = {}
# Keyed by session_id. Value: {"profile": dict, "skill_focus": str}
_SESSION_PROFILES: dict[str, dict] = {}


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
    # _SESSION_PROFILES is written AFTER this so that a failure here
    # does not leave an orphaned profile entry with no matching start time.
    await _stm_set_state(session_id, skill_focus)

    _SESSION_PROFILES[session_id] = {"profile": _profile, "skill_focus": skill_focus}

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
    _SESSION_TURN_COUNTS[session_id] = 0

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

    if session_id not in _SESSION_START_TIMES:
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

    mock_feedback: str | None = None
    if settings.INFERENCE_MODE == "mock":
        assistant_message = f"[MOCK LLM AGT03] Got it - you said: {transcript_text[:60]}"
        mock_feedback = "[MOCK] Good attempt! Keep practising."
    else:
        session_data = _SESSION_PROFILES.get(session_id, {})
        profile = session_data.get("profile", {})
        skill_focus = session_data.get("skill_focus", "SPEAKING")
        messages = [{"role": "system", "content": _build_system_prompt(skill_focus, profile)}]
        for turn in context:
            role = "assistant" if turn.get("role") == "assistant" else "user"
            messages.append({"role": role, "content": turn.get("content", "")})
        assistant_message = await call_llm(messages, AgentID.AGT03)

    try:
        await _stm_append_context(session_id, "assistant", assistant_message)
    except Exception as exc:
        logger.warning("process_turn: AGT-06 append_context (assistant) failed for %s: %s", session_id, exc)

    _SESSION_TURN_COUNTS[session_id] = _SESSION_TURN_COUNTS.get(session_id, 0) + 1

    return {
        "session_id": session_id,
        "assistant_message": assistant_message,
        "transcript_text": transcript_text,
        "mock_feedback": mock_feedback,
        "language": "en",
    }


async def end_session(session_id: str, clerk_user_id: str, skill_focus: str) -> dict:
    start_time = _SESSION_START_TIMES.pop(session_id, None)
    if start_time is None:
        logger.warning("end_session: session %s not in start times — already ended or process restarted", session_id)
    duration_minutes = round((time.monotonic() - start_time) / 60.0, 4) if start_time else 0.0
    turns_completed = _SESSION_TURN_COUNTS.pop(session_id, 0)
    _SESSION_PROFILES.pop(session_id, None)

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

    # Only emit if this invocation actually owned the session (start_time was present).
    # Prevents a double-call from publishing a second event with durationMinutes=0.
    if start_time is not None:
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

"""
Per-turn pipeline: STT -> LLM -> text response.

No server-side TTS. The client speaks the returned assistant_message via the
browser's SpeechSynthesis API — see docs in websocket_handler.py for why.
This module exists so the HTTP route (main.py's POST /sessions/turn) and the
WebSocket route (websocket_handler.py) share exactly one turn-processing path.

run_turn_pipeline (HTTP): returns the assistant reply and the AGT-04/AGT-11
best-effort feedback together in one call, since HTTP can only send a single
response.

run_turn_pipeline_reply + run_turn_pipeline_feedback (WebSocket): split into
two calls so the WebSocket handler can send the assistant reply the moment
it's ready and deliver grammar feedback / translation in a later
"turn_feedback" frame, instead of making the user wait for both AGT-04 and
AGT-11 before they see the reply at all.
"""

from __future__ import annotations

from agents.agt03_tutor.service import process_turn, process_turn_reply, process_turn_feedback


async def run_turn_pipeline(session_id: str, user_message: str | None, audio_base64: str | None) -> dict:
    """Thin wrapper around service.process_turn — used by the HTTP route,
    which cannot send more than one response per request."""
    return await process_turn(session_id, user_message, audio_base64)


async def run_turn_pipeline_reply(session_id: str, user_message: str | None, audio_base64: str | None) -> dict:
    """Thin wrapper around service.process_turn_reply — intended for the
    WebSocket route to call once it's updated to send the assistant's reply
    immediately."""
    return await process_turn_reply(session_id, user_message, audio_base64)


async def run_turn_pipeline_feedback(
    session_id: str,
    transcript_text: str,
    assistant_message: str,
    clerk_user_id: str,
    skill_focus: str,
) -> dict:
    """Thin wrapper around service.process_turn_feedback — intended for the
    WebSocket route to call once it's updated to deliver AGT-04/AGT-11
    feedback in a follow-up frame after the assistant's reply has already
    been sent."""
    return await process_turn_feedback(session_id, transcript_text, assistant_message, clerk_user_id, skill_focus)

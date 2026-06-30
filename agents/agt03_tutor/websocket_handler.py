"""
WebSocket session handler for real-time speaking sessions.

Protocol (client -> server JSON messages):
  {"type": "start", "clerk_user_id": str, "skill_focus": str}
  {"type": "turn", "user_message": str | None, "audio_base64": str | None}
  {"type": "end"}

Protocol (server -> client JSON messages):
  {"type": "session_started", ...same shape as POST /sessions/start response...}
  {"type": "turn_result", ...same shape as POST /sessions/turn response...}
  {"type": "session_ended", ...same shape as POST /sessions/end response...}
  {"type": "error", "detail": str}

No server-side TTS: the assistant_message field in turn_result is plain text.
The client speaks it via the browser's SpeechSynthesis API. This mirrors the
existing ASR fallback precedent in asr.py (client-side Web Speech API as the
free tier-2 path) rather than introducing a paid server-side voice API.

The connection's session_id comes from the URL path, not from the start
message, so a session_id collision/mismatch is impossible by construction.
"""

from __future__ import annotations

import logging

from fastapi import WebSocket, WebSocketDisconnect

from agents.agt03_tutor.service import start_session, end_session
from agents.agt03_tutor.pipeline import run_turn_pipeline

logger = logging.getLogger(__name__)


async def handle_session(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()
    clerk_user_id: str | None = None
    skill_focus: str | None = None
    started = False

    try:
        while True:
            message = await websocket.receive_json()
            msg_type = message.get("type")

            if msg_type == "start":
                clerk_user_id = message.get("clerk_user_id")
                skill_focus = message.get("skill_focus", "SPEAKING")
                result = await start_session(clerk_user_id, skill_focus, session_id)
                started = True
                await websocket.send_json({"type": "session_started", **result})

            elif msg_type == "turn":
                if not started:
                    await websocket.send_json({
                        "type": "error",
                        "detail": "Must send a 'start' message before any 'turn' message.",
                    })
                    continue
                result = await run_turn_pipeline(
                    session_id, message.get("user_message"), message.get("audio_base64")
                )
                await websocket.send_json({"type": "turn_result", **result})

            elif msg_type == "end":
                if started:
                    result = await end_session(session_id, clerk_user_id, skill_focus)
                    # Mark as no-longer-started BEFORE sending/closing so the
                    # `finally` block's cleanup does not call end_session a
                    # second time for this already-ended session.
                    started = False
                    await websocket.send_json({"type": "session_ended", **result})
                await websocket.close()
                return

            else:
                await websocket.send_json({
                    "type": "error",
                    "detail": f"Unknown message type: {msg_type!r}",
                })

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for session %s", session_id)
    finally:
        # Abrupt disconnect without an explicit "end" message must still
        # close out the session — otherwise it leaks until Redis TTL expiry
        # and AGT-01 never receives session.end.
        if started:
            try:
                await end_session(session_id, clerk_user_id, skill_focus)
            except Exception as exc:
                logger.warning("handle_session: cleanup end_session failed for %s: %s", session_id, exc)

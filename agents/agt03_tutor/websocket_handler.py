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

Error handling: a non-JSON text frame, an unknown "type", a "turn" sent before
"start", or an exception raised by start_session/run_turn_pipeline/end_session
(e.g. AGT-06 unreachable, unknown session) all produce a {"type": "error", ...}
response and keep the connection alive — mirroring the HTTP route's
try/except ValueError -> 422 handling instead of crashing the socket.
WebSocketDisconnect is the one exception NOT converted into an error message,
since by the time it's raised the socket is already gone.

No server-side TTS: the assistant_message field in turn_result is plain text.
The client speaks it via the browser's SpeechSynthesis API. This mirrors the
existing ASR fallback precedent in asr.py (client-side Web Speech API as the
free tier-2 path) rather than introducing a paid server-side voice API.

The connection's session_id comes from the URL path, not from the start
message, so a session_id collision/mismatch is impossible by construction.
"""

from __future__ import annotations

import json
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
            try:
                message = await websocket.receive_json()
            except WebSocketDisconnect:
                # Let the outer try/finally handle cleanup; do not attempt to
                # send a response on a socket that is already gone.
                raise
            except (json.JSONDecodeError, ValueError):
                # receive_json() raises on non-JSON text frames. The socket is
                # still open here, so reply with a graceful error instead of
                # letting the malformed frame crash the connection.
                await websocket.send_json({
                    "type": "error",
                    "detail": "invalid JSON",
                })
                continue

            try:
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
                raise
            except Exception as exc:
                # start_session/run_turn_pipeline/end_session can all raise
                # (e.g. AGT-06 unavailable, unknown session). Report it to the
                # client and keep the connection alive rather than crashing —
                # mirrors the HTTP route's try/except ValueError -> 422 handling.
                logger.warning(
                    "handle_session: error processing message type=%r for session %s: %s",
                    message.get("type") if isinstance(message, dict) else None,
                    session_id, exc,
                )
                await websocket.send_json({"type": "error", "detail": str(exc)})

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

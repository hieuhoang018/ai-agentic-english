"""
Per-turn pipeline: STT -> LLM -> text response.

No server-side TTS. The client speaks the returned assistant_message via the
browser's SpeechSynthesis API — see docs in websocket_handler.py for why.
This module exists so the HTTP route (main.py's POST /sessions/turn) and the
WebSocket route (websocket_handler.py) share exactly one turn-processing path.
"""

from __future__ import annotations

from agents.agt03_tutor.service import process_turn


async def run_turn_pipeline(session_id: str, user_message: str | None, audio_base64: str | None) -> dict:
    """Thin wrapper around service.process_turn — the single source of truth
    for per-turn logic, shared by HTTP and WebSocket entry points."""
    return await process_turn(session_id, user_message, audio_base64)

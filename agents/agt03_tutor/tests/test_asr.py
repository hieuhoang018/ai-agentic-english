from __future__ import annotations

import httpx
import respx

from agents.agt03_tutor import asr
from agents.shared.config import settings as cfg

GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"


def _multipart_field(request: httpx.Request, field_name: str) -> str | None:
    """
    Extract a form field's value from a multipart/form-data request body.
    Verified against httpx's actual wire format: fields are separated by
    '--<boundary>', each with 'Content-Disposition: form-data; name="X"'
    followed by a blank line and the raw value (asr.py sends `data=` fields
    alongside `files=`, which forces httpx to encode as multipart, not
    urlencoded — a plain query-string parse would silently misread this).
    """
    boundary = request.headers["content-type"].split("boundary=")[1].encode()
    body = request.read()
    for part in body.split(b"--" + boundary):
        if f'name="{field_name}"'.encode() in part:
            return part.split(b"\r\n\r\n", 1)[1].rsplit(b"\r\n", 1)[0].decode()
    return None


async def test_transcribe_mock_mode_short_circuits_without_network(monkeypatch):
    """INFERENCE_MODE=mock must never touch the network."""
    monkeypatch.setattr(cfg, "INFERENCE_MODE", "mock")

    result = await asr.transcribe(b"fake-audio-bytes", "session1")

    assert result["source"] == "mock"
    assert result["text"] == "Mock transcription of user speech."


@respx.mock
async def test_transcribe_sends_english_language_hint_to_groq(monkeypatch):
    """
    Regression test for the language-misdetection bug: without an explicit
    `language` hint, Groq's Whisper auto-detects the spoken language from
    audio alone, which is unreliable for short clips and non-native accents
    and can silently transcribe English speech as another language (observed:
    Indonesian). AGT-03 is English-only, so the hint must always be 'en'.
    """
    monkeypatch.setattr(cfg, "INFERENCE_MODE", "live")

    route = respx.post(GROQ_URL).mock(
        return_value=httpx.Response(
            200, json={"text": "hello this is a test", "language": "english"}
        )
    )

    result = await asr.transcribe(b"fake-audio-bytes", "session1")

    assert route.called
    sent_request = route.calls[0].request
    assert _multipart_field(sent_request, "language") == "en"
    assert result["text"] == "hello this is a test"
    assert result["source"] == "groq"


@respx.mock
async def test_transcribe_falls_back_on_groq_429(monkeypatch):
    """Existing tier-2 fallback behavior must survive the language-hint change."""
    monkeypatch.setattr(cfg, "INFERENCE_MODE", "live")

    respx.post(GROQ_URL).mock(return_value=httpx.Response(429))

    result = await asr.transcribe(b"fake-audio-bytes", "session1")

    assert result["fallback"] is True
    assert result["source"] == "web_speech_fallback"
    assert result["text"] is None

"""
ASR (speech-to-text) two-tier routing.
Tier 1: Groq Whisper Large v3 (2,000 req/day, 228x real-time)
Tier 2: Web Speech API fallback signal to client

Min billing unit on Groq: 10 seconds. Buffer short utterances before sending.
"""

import httpx
import logging
from agents.shared.config import settings

logger = logging.getLogger(__name__)


async def transcribe(audio_bytes: bytes, session_id: str) -> dict:
    if settings.INFERENCE_MODE == "mock":
        return {"text": "Mock transcription of user speech.", "confidence": 0.95, "source": "mock"}

    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                files={"file": ("audio.webm", audio_bytes, "audio/webm")},
                # Pinned to English: without this hint Groq auto-detects the
                # spoken language from audio alone, which is unreliable on
                # short clips and non-native accents and can silently
                # transcribe English speech as another language entirely.
                data={"model": "whisper-large-v3", "response_format": "verbose_json", "language": "en"},
                timeout=10.0,
            )
            r.raise_for_status()
            data = r.json()
            return {"text": data["text"], "confidence": 0.9, "source": "groq"}
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            return {"text": None, "source": "web_speech_fallback", "fallback": True}
        raise

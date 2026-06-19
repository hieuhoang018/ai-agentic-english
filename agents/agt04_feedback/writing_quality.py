"""
Writing quality assessment using Ollama structured rubric prompt.
Post-submission only — never in the real-time speaking path.
Target latency: <20s (acceptable for post-submission feedback).

Rubric dimensions (0.0–1.0 each):
  grammar       — grammatical accuracy
  coherence     — sentence-level logical flow
  cohesion      — paragraph-level connections and transitions
  register      — formality appropriate to context
  structure     — document structure (subject line, greeting, body, closing)
"""

import json
import logging
from agents.shared.llm.router import call_llm, AgentID
from agents.shared.config import settings

logger = logging.getLogger(__name__)

RUBRIC_SYSTEM_PROMPT = """You are an expert English writing assessor specialising in professional communication.
Score the following text on these dimensions (0.0 to 1.0 each):
  - grammar: grammatical accuracy and sentence correctness
  - coherence: logical flow and clarity within sentences
  - cohesion: paragraph-level connections and use of transitions
  - register: appropriateness of formality for the stated context
  - structure: completeness of document structure (e.g. email: subject, greeting, body, closing)

Also identify:
  - vietnamese_indirectness: true if the text contains indirect phrasing that reads as evasive in English professional context
  - top_issues: list of up to 3 specific improvement suggestions

Return ONLY a JSON object with these exact keys. No preamble."""


async def score_writing(text: str, context: str = "professional email") -> dict:
    """
    Score a writing sample against the professional writing rubric.
    In mock mode: returns plausible stub scores.
    """
    if settings.INFERENCE_MODE == "mock":
        return {
            "grammar": 0.7,
            "coherence": 0.65,
            "cohesion": 0.6,
            "register": 0.75,
            "structure": 0.8,
            "vietnamese_indirectness": False,
            "top_issues": ["Mock issue 1", "Mock issue 2"],
            "mock": True,
        }

    messages = [
        {"role": "system", "content": RUBRIC_SYSTEM_PROMPT},
        {"role": "user", "content": f"Context: {context}\n\nText to assess:\n{text}"},
    ]

    try:
        raw = await call_llm(messages, AgentID.AGT04)
        scores = json.loads(raw)
        # Validate expected keys
        for key in ("grammar", "coherence", "cohesion", "register", "structure"):
            scores.setdefault(key, 0.5)
        scores.setdefault("vietnamese_indirectness", False)
        scores.setdefault("top_issues", [])
        return scores
    except Exception as exc:
        logger.error("Writing quality scoring failed: %s", exc)
        return {
            "grammar": 0.5, "coherence": 0.5, "cohesion": 0.5,
            "register": 0.5, "structure": 0.5,
            "vietnamese_indirectness": False,
            "top_issues": [],
            "error": str(exc),
        }

"""
Feedback Agent service layer.

DUAL-WRITE PROTOCOL (critical):
  Every detected error is written to BOTH:
    1. Redis STM (session:{sessionId}:errors) — synchronous, critical for intra-session merge
    2. Kafka agent.errors topic — best-effort, for LTM persistence

  If STM write fails: raise the error (session correctness depends on STM)
  If Kafka write fails: log and continue (session continues without event)
"""

import asyncio
import httpx
import logging
from agents.shared.config import settings
from agents.agt04_feedback import grammar, fluency, writing_quality, pedagogical
from agents.shared.events.producer import emit

logger = logging.getLogger(__name__)

AGT06_BASE = settings.AGT06_BASE_URL


async def _stm_append_error(session_id: str, clerk_user_id: str, error: dict) -> None:
    """
    Write 1 of dual-write: append error to Redis STM via AGT-06.
    This write is CRITICAL — raises on failure.
    """
    async with httpx.AsyncClient(timeout=5.0) as client:
        payload = {**error, "clerk_user_id": clerk_user_id}
        resp = await client.post(
            f"{AGT06_BASE}/sessions/{session_id}/errors",
            json=payload,
        )
        resp.raise_for_status()


async def _kafka_emit_error(session_id: str, clerk_user_id: str, error: dict) -> None:
    """
    Write 2 of dual-write: emit to Kafka agent.errors.
    Best-effort — logs failure but does not raise.
    """
    try:
        await emit(
            "agent.errors",
            {"sessionId": session_id, "clerkUserId": clerk_user_id, "error": error},
            agent_id="AGT04",
        )
    except Exception as exc:
        logger.error("Kafka dual-write failed session=%s error=%s", session_id, exc)


async def record_error(session_id: str, clerk_user_id: str, error: dict) -> None:
    """
    Dual-write a single error event.
    Caller is AGT-04 internally — called for every detected error.
    """
    await _stm_append_error(session_id, clerk_user_id, error)  # raises on failure
    await _kafka_emit_error(session_id, clerk_user_id, error)   # best-effort


async def analyze_speaking_turn(
    transcript: str,
    session_id: str,
    clerk_user_id: str,
    duration_seconds: float = 0.0,
    skill_domain: str = "SPEAKING",
) -> dict:
    """
    Analyze a single speaking turn.
    Returns feedback and records all errors via dual-write.
    """
    # Grammar analysis
    grammar_errors = await grammar.analyze_grammar(transcript, skill_domain)

    # Fluency metrics
    fluency_metrics = fluency.compute_fluency_metrics(transcript, duration_seconds)

    # Collect all error types for throttle check
    error_types = [e.get("errorType", "grammar") for e in grammar_errors]
    throttled, priority_type = pedagogical.should_throttle(error_types)

    # Dual-write each error
    for err in grammar_errors:
        error_event = {
            "error_type": err.get("errorType", "grammar"),
            "skill_domain": skill_domain,
            "severity": err.get("severity", 1),
            "context_excerpt": transcript[:100],
        }
        await record_error(session_id, clerk_user_id, error_event)

    return {
        "grammar_errors": grammar_errors if not throttled else [
            e for e in grammar_errors if e.get("errorType") == priority_type
        ],
        "fluency": fluency_metrics,
        "throttled": throttled,
        "total_errors_detected": len(grammar_errors),
        "surfaced_error_count": 1 if throttled else len(grammar_errors),
    }


async def analyze_writing(
    draft: str,
    prompt: str,
    session_id: str,
    clerk_user_id: str,
) -> dict:
    """
    Analyze a writing submission. Post-submission — not real-time.
    Returns annotated quality scores and grammar errors.
    """
    grammar_errors = await grammar.analyze_grammar(draft, skill_domain="WRITING")
    quality_scores = await writing_quality.score_writing(draft, context=prompt)

    # Dual-write each grammar error
    for err in grammar_errors:
        error_event = {
            "error_type": err.get("errorType", "grammar"),
            "skill_domain": "WRITING",
            "severity": err.get("severity", 1),
            "context_excerpt": draft[:100],
        }
        await record_error(session_id, clerk_user_id, error_event)

    return {
        "quality_scores": quality_scores,
        "grammar_errors": grammar_errors,
        "total_errors": len(grammar_errors),
    }

"""
Grammar analysis: LanguageTool (deterministic rules) + Ollama (contextual analysis).

LanguageTool handles: punctuation, subject-verb agreement, article usage,
explicit rule violations, spelling.

Ollama handles: register mismatch, collocational errors, nuanced appropriateness,
pragmatic errors that LanguageTool cannot detect.

Results are merged and deduplicated by error type and character offset.
"""

import asyncio
import logging
from agents.shared.config import settings
from agents.shared.http.client import get_http_client
from agents.shared.llm.router import call_llm, AgentID

logger = logging.getLogger(__name__)


async def analyze_grammar(text: str, skill_domain: str = "WRITING") -> list[dict]:
    """
    Analyze text for grammar errors using the hybrid pipeline.
    Returns a list of error dicts: [{errorType, message, offset, length, severity}]
    """
    lt_errors, llm_errors = await asyncio.gather(
        _languagetool_check(text),
        _llm_contextual_check(text, skill_domain),
    )

    # Merge and deduplicate: prefer LT errors when character positions overlap.
    # Doc-level errors (offset < 0) are never keyed — always include them.
    merged = lt_errors[:]
    lt_offsets = {
        (e["offset"], e.get("length", 0))
        for e in lt_errors
        if e.get("offset", -1) >= 0
    }

    for err in llm_errors:
        offset = err.get("offset", -1)
        if offset < 0:
            merged.append(err)  # doc-level: no position to dedup against
        elif (offset, err.get("length", 0)) not in lt_offsets:
            merged.append(err)

    return merged


async def _languagetool_check(text: str) -> list[dict]:
    """Call self-hosted LanguageTool API for deterministic rule-based checking."""
    if settings.INFERENCE_MODE == "mock":
        return [{"errorType": "mock_grammar", "message": "Mock grammar error", "severity": 1, "offset": 0, "length": 4}]

    try:
        client = await get_http_client()
        resp = await client.post(
            f"{settings.LANGUAGETOOL_URL}/check",
            data={"text": text, "language": "en-US"},
            timeout=5.0,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("LanguageTool unavailable: %s", exc)
        return []

    errors = []
    for match in data.get("matches", []):
        rule = match.get("rule", {})
        errors.append({
            "errorType": rule.get("category", {}).get("id", "GRAMMAR").lower(),
            "message": match.get("message", ""),
            "offset": match.get("offset", 0),
            "length": match.get("length", 0),
            "severity": 2 if rule.get("issueType") == "misspelling" else 1,
            "source": "languagetool",
        })
    return errors


async def _llm_contextual_check(text: str, skill_domain: str) -> list[dict]:
    """
    LLM-based contextual grammar check for errors LanguageTool misses.
    Returns errors as structured list. Uses AGT-04's fast Groq model.
    """
    if settings.INFERENCE_MODE == "mock":
        return []

    messages = [
        {"role": "system", "content": (
            "You are an English grammar expert. Analyze the following text for contextual grammar errors "
            f"in {skill_domain.lower()} context. Focus on: register mismatch, collocation errors, "
            "inappropriate word choice, and pragmatic errors. "
            "Return a JSON array of errors: [{\"errorType\": str, \"message\": str, \"severity\": 1-3}]. "
            "Return [] if no errors. Return ONLY the JSON array, no preamble."
        )},
        {"role": "user", "content": text},
    ]
    try:
        raw = await call_llm(messages, AgentID.AGT04)
        import json
        errors = json.loads(raw)
        for e in errors:
            e["source"] = "llm"
            e.setdefault("offset", -1)
            e.setdefault("length", 0)
        return errors if isinstance(errors, list) else []
    except Exception as exc:
        logger.warning("LLM grammar check failed: %s", exc)
        return []

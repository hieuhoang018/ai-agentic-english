"""
Progress Analysis Agent service.
Runs nightly analysis and emits pattern events to Kafka.
CUSUM (cusum.py), PELT plateau detection (changepoint.py, per skill domain)
and the multi-signal risk score (risk_model.py) are all real implementations.
"""

import httpx
import json
import logging
from datetime import datetime, timezone
from agents.agt08_analysis.cusum import detect_persistent_errors
from agents.agt08_analysis.changepoint import detect_plateau
from agents.agt08_analysis.risk_model import compute_risk_score
from agents.shared.db.redis_client import get_redis
from agents.shared.events.producer import emit

logger = logging.getLogger(__name__)


def _analysis_key(clerk_user_id: str) -> str:
    return f"agt08:latest:{clerk_user_id}"


async def _persist_latest(clerk_user_id: str, result: dict) -> None:
    """Write the last successful analysis result. No TTL: this is a 'last
    known analysis,' not a cheap-to-recompute cache — see run_analysis()."""
    r = await get_redis()
    await r.set(_analysis_key(clerk_user_id), json.dumps(result))


AGT06_BASE = "http://agt06-memory:8106"
AGT01_BASE = "http://agt01-profiling:8101"

# SPEAKING is never CAT-assessed (see migration 009's CHECK constraint and
# AGT-05's own rejection of SPEAKING requests), so it has no theta history.
ASSESSMENT_SKILL_DOMAINS = ["LISTENING", "READING", "WRITING"]


async def _fetch_theta_history(client: httpx.AsyncClient, clerk_user_id: str, skill_domain: str) -> list[float]:
    try:
        r = await client.get(
            f"{AGT06_BASE}/ltm/{clerk_user_id}/assessment-history",
            params={"skill_domain": skill_domain},
        )
        r.raise_for_status()
        rows = r.json()
        return [row["irt_score"] for row in rows if row.get("irt_score") is not None]
    except Exception as exc:
        logger.warning("Theta history fetch failed for %s/%s: %s", clerk_user_id, skill_domain, exc)
        return []


async def run_analysis(clerk_user_id: str) -> dict:
    """
    Run all analysis algorithms for a user and emit any detected pattern events.
    Returns analysis summary dict.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            errors_r = await client.get(
                f"{AGT06_BASE}/ltm/{clerk_user_id}/errors", params={"limit": 200}
            )
            sessions_r = await client.get(
                f"{AGT06_BASE}/ltm/{clerk_user_id}/sessions", params={"limit": 50}
            )
            profile_r = await client.get(f"{AGT01_BASE}/profile/{clerk_user_id}")
            errors_r.raise_for_status()
            sessions_r.raise_for_status()
            profile_r.raise_for_status()
            errors = errors_r.json()
            sessions = sessions_r.json()
            profile = profile_r.json()

            theta_histories = {
                skill: await _fetch_theta_history(client, clerk_user_id, skill)
                for skill in ASSESSMENT_SKILL_DOMAINS
            }
    except Exception as exc:
        logger.warning("Analysis data fetch failed for %s: %s", clerk_user_id, exc)
        return {"clerk_user_id": clerk_user_id, "error": str(exc), "patterns": []}

    # CUSUM: persistent error detection
    persistent = detect_persistent_errors(errors, min_sessions=5)

    # Plateau detection: one real PELT result per assessed skill domain.
    plateau_by_skill = {skill: detect_plateau(history) for skill, history in theta_histories.items()}

    # Behavioural risk
    behavioral = profile.get("behavioral_profile", {})
    days_since = 0
    if sessions:
        try:
            last_str = str(sessions[0].get("start_time", ""))
            last_dt = datetime.fromisoformat(last_str.replace("Z", "+00:00"))
            days_since = (datetime.now(timezone.utc) - last_dt).days
        except Exception:
            days_since = 0
    risk = compute_risk_score(behavioral, days_since, sessions)

    # Emit events for detected patterns
    for pattern in persistent:
        await emit("agent.pattern.events", {
            "type": "persistent_weakness",
            "clerkUserId": clerk_user_id,
            "pattern": pattern,
        }, agent_id="AGT08")

    if risk > 0.7:
        await emit("agent.pattern.events", {
            "type": "behavioral_risk",
            "clerkUserId": clerk_user_id,
            "riskScore": risk,
        }, agent_id="AGT08")

    result = {
        "clerk_user_id": clerk_user_id,
        "patterns": persistent,
        "plateau_by_skill": plateau_by_skill,
        "risk_score": round(risk, 4),
        "insufficient_data": len(sessions) < 5,
    }
    await _persist_latest(clerk_user_id, result)
    return result

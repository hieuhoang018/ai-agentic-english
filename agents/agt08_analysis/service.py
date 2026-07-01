"""
Progress Analysis Agent service.
Runs nightly analysis and emits pattern events to Kafka.
All analysis algorithms are stubs — see individual files for TODO specs.
"""

import httpx
import logging
from datetime import datetime, timezone
from agents.agt08_analysis.cusum import detect_persistent_errors
from agents.agt08_analysis.changepoint import detect_plateau
from agents.agt08_analysis.risk_model import compute_risk_score
from agents.shared.events.producer import emit

logger = logging.getLogger(__name__)

AGT06_BASE = "http://agt06-memory:8106"
AGT01_BASE = "http://agt01-profiling:8101"


async def run_analysis(clerk_user_id: str) -> dict:
    """
    Run all analysis algorithms for a user and emit any detected pattern events.
    Returns analysis summary dict.
    At scaffold: all algorithms return empty/stub results.
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
    except Exception as exc:
        logger.warning("Analysis data fetch failed for %s: %s", clerk_user_id, exc)
        return {"clerk_user_id": clerk_user_id, "error": str(exc), "patterns": []}

    # CUSUM: persistent error detection
    persistent = detect_persistent_errors(errors, min_sessions=5)

    # Plateau detection
    theta_series = [0.0] * len(sessions)  # proxy count; Phase 8+ will extract real theta values
    plateau_result = detect_plateau(theta_series)

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

    return {
        "clerk_user_id": clerk_user_id,
        "patterns": persistent,
        "plateau": plateau_result,
        "risk_score": risk,
        "insufficient_data": len(sessions) < 5,
        "stub": True,
    }

"""
Novu notification trigger wrapper.
AGT-10 is the ONLY agent that calls Novu. All notification delivery routes through here.

Templates must be created in the Novu dashboard:
  - daily-reminder
  - re-engagement-nudge
  - weekly-progress-summary
  - proactive-intervention
  - skill-specific-nudge
  - milestone-celebration
  - learning-path-ready
  - achievement-unlocked

Minimum inter-notification interval: 24h for non-urgent categories.
"""

import httpx
import logging
from agents.shared.config import settings

logger = logging.getLogger(__name__)

NOVU_API_BASE = "https://api.novu.co/v1"


async def trigger(template_id: str, subscriber_id: str, payload: dict) -> bool:
    """
    Trigger a Novu notification template.
    Returns True on success, False on failure (non-fatal — notification missed, session continues).
    In mock mode: logs the call without hitting Novu API.
    """
    if settings.INFERENCE_MODE == "mock" or not settings.NOVU_API_KEY:
        logger.info(
            "[MOCK NOVU] trigger template=%s subscriber=%s payload=%s",
            template_id, subscriber_id, payload,
        )
        return True

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                f"{NOVU_API_BASE}/events/trigger",
                headers={
                    "Authorization": f"ApiKey {settings.NOVU_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "name": template_id,
                    "to": {"subscriberId": subscriber_id},
                    "payload": payload,
                },
            )
            r.raise_for_status()
            return True
    except Exception as exc:
        logger.error("Novu trigger failed template=%s subscriber=%s error=%s", template_id, subscriber_id, exc)
        return False


async def sync_subscriber(clerk_user_id: str, email: str, name: str | None = None) -> bool:
    """
    Create or update a Novu subscriber record.
    Called when user is created (via user.upserted Kafka event).
    """
    if settings.INFERENCE_MODE == "mock" or not settings.NOVU_API_KEY:
        logger.info("[MOCK NOVU] sync subscriber=%s email=%s", clerk_user_id, email)
        return True

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.put(
                f"{NOVU_API_BASE}/subscribers/{clerk_user_id}",
                headers={
                    "Authorization": f"ApiKey {settings.NOVU_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={"email": email, "firstName": name or "", "subscriberId": clerk_user_id},
            )
            r.raise_for_status()
            return True
    except Exception as exc:
        logger.error("Novu subscriber sync failed subscriber=%s error=%s", clerk_user_id, exc)
        return False

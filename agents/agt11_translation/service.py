import httpx
import logging
from agents.agt11_translation.zone import get_language_zone, zone_label
from agents.agt11_translation.cache import translate

logger = logging.getLogger(__name__)

AGT01_BASE = "http://agt01-profiling:8101"


async def get_zone_for_user(clerk_user_id: str, session_type: str = "exercise") -> tuple[str, float]:
    """
    Fetch theta-R from AGT-01 and compute zone.
    Returns (zone, theta_r).
    Falls back to bilingual zone on any error (safe default).
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{AGT01_BASE}/profile/{clerk_user_id}")
            resp.raise_for_status()
            profile = resp.json()
            theta_r = profile.get("irt_theta", {}).get("R", 0.0)
    except Exception as exc:
        logger.warning("Could not fetch profile for %s: %s — defaulting to bilingual", clerk_user_id, exc)
        theta_r = 0.0  # B1 midpoint, bilingual zone

    zone = get_language_zone(theta_r, session_type)
    return zone, theta_r


async def translate_for_user(
    content: str,
    clerk_user_id: str,
    session_type: str = "exercise",
) -> dict:
    """
    Translate content for a specific user.
    Determines language zone from AGT-01 profile, applies cache-first translation.
    """
    zone, theta_r = await get_zone_for_user(clerk_user_id, session_type)

    if zone == "en_only":
        return {
            "original": content,
            "translated": content,  # no translation needed
            "zone": zone,
            "zone_label": zone_label(zone),
            "theta_r": theta_r,
            "cached": False,
        }

    translated, was_cached = await translate(content, zone)
    return {
        "original": content,
        "translated": translated,
        "zone": zone,
        "zone_label": zone_label(zone),
        "theta_r": theta_r,
        "cached": was_cached,
    }


async def explain_error(
    error_type: str,
    example: str,
    clerk_user_id: str,
    session_type: str = "exercise",
) -> dict:
    """
    Generate a bilingual explanation for a grammar error.
    Used by AGT-04 when rendering feedback to the user.
    """
    content = f"Grammar error type: {error_type}\nExample: {example}"
    return await translate_for_user(content, clerk_user_id, session_type)

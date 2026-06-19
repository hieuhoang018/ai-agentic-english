"""
Three-zone proficiency language selection model.

Based on theta-R (reading comprehension IRT ability estimate from AGT-01).
Zone determines whether explanations are given in Vietnamese, bilingual, or English only.

Zone boundaries (IRT theta scale):
  theta-R < -0.5  → vi_primary  (≈ below B1: Vietnamese-first explanations)
  -0.5 to 1.0     → bilingual   (≈ B1-B2: English with Vietnamese support)
  > 1.0           → en_only     (≈ above B2: full English immersion)

Conversation sessions ALWAYS return en_only regardless of theta-R.
This enforces maximum English immersion during speaking practice.
"""

ZONE_VI_PRIMARY = "vi_primary"
ZONE_BILINGUAL = "bilingual"
ZONE_EN_ONLY = "en_only"

THETA_R_VI_MAX = -0.5   # below this → Vietnamese primary
THETA_R_BI_MAX = 1.0    # below this (and above VI_MAX) → bilingual


def get_language_zone(theta_r: float, session_type: str = "exercise") -> str:
    """
    Returns the language zone for this learner and session type.

    session_type: "conversation" | "exercise" | "assessment" | "review"
    Conversation sessions always override to en_only (maximum immersion).
    """
    if session_type == "conversation":
        return ZONE_EN_ONLY

    if theta_r < THETA_R_VI_MAX:
        return ZONE_VI_PRIMARY
    elif theta_r <= THETA_R_BI_MAX:
        return ZONE_BILINGUAL
    else:
        return ZONE_EN_ONLY


def zone_label(zone: str) -> str:
    """Human-readable zone name for logging and API responses."""
    return {
        ZONE_VI_PRIMARY: "Vietnamese primary (below B1)",
        ZONE_BILINGUAL: "Bilingual (B1-B2)",
        ZONE_EN_ONLY: "English only (above B2)",
    }.get(zone, zone)

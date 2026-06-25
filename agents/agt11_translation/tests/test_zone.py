import pytest
from agents.agt11_translation.zone import (
    get_language_zone,
    zone_label,
    ZONE_VI_PRIMARY,
    ZONE_BILINGUAL,
    ZONE_EN_ONLY,
    THETA_R_VI_MAX,
    THETA_R_BI_MAX,
)


# ---------------------------------------------------------------------------
# Zone boundary correctness
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("theta_r,expected", [
    (-2.0,  ZONE_VI_PRIMARY),   # well below B1
    (-0.6,  ZONE_VI_PRIMARY),   # just below lower boundary
    (-0.5,  ZONE_BILINGUAL),    # at lower boundary (inclusive)
    (0.0,   ZONE_BILINGUAL),    # B1 midpoint
    (1.0,   ZONE_BILINGUAL),    # at upper boundary (inclusive)
    (1.01,  ZONE_EN_ONLY),      # just above upper boundary
    (2.0,   ZONE_EN_ONLY),      # well above B2
])
def test_zone_boundaries(theta_r: float, expected: str):
    assert get_language_zone(theta_r) == expected


# ---------------------------------------------------------------------------
# Conversation sessions always override to en_only
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("theta_r", [-2.0, -0.5, 0.0, 1.0, 2.0])
def test_conversation_always_en_only(theta_r: float):
    assert get_language_zone(theta_r, "conversation") == ZONE_EN_ONLY


# ---------------------------------------------------------------------------
# Non-conversation session types respect theta-R
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("session_type", ["exercise", "assessment", "review"])
def test_non_conversation_types_use_theta(session_type: str):
    assert get_language_zone(-1.0, session_type) == ZONE_VI_PRIMARY
    assert get_language_zone(0.0, session_type) == ZONE_BILINGUAL
    assert get_language_zone(2.0, session_type) == ZONE_EN_ONLY


# ---------------------------------------------------------------------------
# zone_label human-readable strings
# ---------------------------------------------------------------------------

def test_zone_label_vi_primary():
    assert "Vietnamese" in zone_label(ZONE_VI_PRIMARY)


def test_zone_label_bilingual():
    assert "Bilingual" in zone_label(ZONE_BILINGUAL)


def test_zone_label_en_only():
    assert "English" in zone_label(ZONE_EN_ONLY)


def test_zone_label_unknown_passthrough():
    assert zone_label("unknown_zone") == "unknown_zone"


# ---------------------------------------------------------------------------
# Boundary constants sanity
# ---------------------------------------------------------------------------

def test_theta_constants_ordering():
    assert THETA_R_VI_MAX < THETA_R_BI_MAX

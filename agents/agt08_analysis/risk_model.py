"""
Behavioural risk scoring for disengagement prediction.

STUB — returns 0.0 risk score always.
TODO Phase 8+: implement logistic regression model.

Full implementation spec:
  Feature vector (per user, computed from LTM):
    - session_length_trend: EWMA slope over last 14 days
    - completion_rate_trend: EWMA slope over last 14 days
    - notification_open_rate: last 7 days (from Novu analytics API)
    - days_since_last_session: raw count
    - streak_broken: bool (streak reset to 0 in last 7 days)

  Model: sklearn LogisticRegression, retrained monthly on platform data
  Output: risk_score in [0.0, 1.0]
  Alert threshold: risk_score > 0.7 -> behavioral_risk_event to AGT-10

Install: pip install scikit-learn>=1.4.0
"""


def compute_risk_score(
    behavioral_profile: dict,
    days_since_last_session: int,
) -> float:
    """
    Stub: use simple rules as a placeholder until model is trained.
    TODO Phase 8+: replace with trained logistic regression model.
    """
    # Simple rule stub: risk increases with days absent
    if days_since_last_session >= 7:
        return 0.8
    elif days_since_last_session >= 3:
        return 0.4
    return 0.0

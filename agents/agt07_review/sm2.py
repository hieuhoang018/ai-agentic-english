"""
Spaced repetition scheduling.

STUB — fixed-interval scheduling only.
TODO Phase 8+: implement full SM-2 + Bayesian memory model.
  Forgetting curve:  R = e^(-t / S)
  Stability update:  S_new = S * (1 + multiplier * (quality - 3))
  Schedule when:     R < target_retrievability (default 0.9)

Quality scale (0-5):
  0-2: forgotten (stability halved, re-queue at 1 day)
  3:   correct with difficulty
  4:   correct
  5:   perfect recall
"""

from datetime import datetime, timezone, timedelta

# Stub intervals in days per quality rating
STUB_INTERVALS = {0: 1, 1: 1, 2: 1, 3: 3, 4: 7, 5: 14}


def next_review_date_stub(quality: int, current_stability: float) -> datetime:
    """
    Stub: return next review date based on fixed intervals.
    TODO Phase 8+: compute from R = e^(-t/S) with target R=0.9.
    """
    days = STUB_INTERVALS.get(quality, 3)
    return datetime.now(timezone.utc) + timedelta(days=days)


def update_stability_stub(quality: int, current_stability: float) -> float:
    """
    Stub stability update.
    TODO Phase 8+: S_new = S * (1 + multiplier * (quality - 3))
    """
    if quality < 3:
        return max(1.0, current_stability * 0.5)
    return current_stability * (1.0 + 0.1 * (quality - 3))


def compute_retrievability(stability: float, days_since_review: float) -> float:
    """
    R = e^(-t/S).  Always computed correctly — used for scheduling priority.
    """
    import math
    if stability <= 0:
        return 0.0
    return round(math.exp(-days_since_review / stability), 4)

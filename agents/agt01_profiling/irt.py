"""
IRT (Item Response Theory) theta update logic.

Stub implementation: simple MAP approximation.
  theta_new = theta_old + 0.1 * (score - 0.5)
  where score is in [0, 1].

TODO Phase 8+: implement full 3PL IRT EAP estimation.
  3PL model: P(correct | theta) = c + (1-c) / (1 + exp(-a*(theta-b)))
  Parameters per item: a (discrimination), b (difficulty), c (guessing)
  EAP: theta_EAP = integral(theta * L(theta) * prior(theta)) / integral(L(theta) * prior(theta))
  Prior: standard normal N(0, 1)
"""

from agents.shared.cefr import theta_to_cefr  # re-exported: single source in shared/cefr.py


def update_theta(theta_old: float, score: float) -> float:
    """
    Approximate IRT theta update.
    score: 0.0 = wrong, 1.0 = correct, fractional for partial credit.
    Returns updated theta estimate.
    """
    # TODO Phase 8+: replace with full 3PL EAP estimation
    delta = 0.1 * (score - 0.5)
    return round(theta_old + delta, 4)

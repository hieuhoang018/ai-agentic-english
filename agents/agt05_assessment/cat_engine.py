"""
Computerised Adaptive Testing (CAT) engine.

STUB — sequential item delivery only.
TODO Phase 8+: implement full 3PL IRT with Fisher information maximisation.

3PL model (for future implementation):
  P(correct | theta) = c + (1-c) / (1 + exp(-a*(theta - b)))
  Parameters per item: a (discrimination), b (difficulty), c (guessing)

CAT termination:
  SE(theta) < 0.3  OR  max_items reached (default 30 per skill)

Item selection:
  Fisher information maximisation: I(theta) = a^2 * P*(1-P*) / P(1-P)
  where P* = P - c / (1 - c)

Exposure control:
  Sympson-Hetter method (target exposure rate <= 0.25 per item)
  TODO Phase 8+: implement exposure control table per item bank
"""

import math

from agents.shared.config import settings

_QUADRATURE_POINTS = [round(-4.0 + 0.1 * i, 2) for i in range(81)]  # -4.0 to 4.0 step 0.1


def _prior_density(theta: float) -> float:
    """Standard normal N(0, 1) probability density."""
    return math.exp(-0.5 * theta * theta) / math.sqrt(2 * math.pi)


def _p_correct(theta: float, difficulty: float) -> float:
    """1PL (Rasch) probability of a correct response."""
    exponent = max(-700.0, min(700.0, -(theta - difficulty)))
    return 1.0 / (1.0 + math.exp(exponent))


def _likelihood(theta: float, responses: list[dict]) -> float:
    likelihood = 1.0
    for r in responses:
        p = _p_correct(theta, r["difficulty_param"])
        likelihood *= p if r["correct"] else (1.0 - p)
    return likelihood


def estimate_theta_eap(responses: list[dict]) -> float:
    """
    EAP (Expectation A Posteriori) theta estimation under a 1PL (Rasch) model,
    via numerical quadrature over a fixed grid (no numpy/scipy dependency).
    Each response dict must have "difficulty_param" (float) and "correct" (bool).
    Returns 0.0 (the prior mean) when responses is empty.
    """
    if not responses:
        return 0.0

    numerator = 0.0
    denominator = 0.0
    for theta in _QUADRATURE_POINTS:
        weight = _likelihood(theta, responses) * _prior_density(theta)
        numerator += theta * weight
        denominator += weight

    if denominator == 0.0:
        return 0.0  # degenerate likelihood (extremely unlikely in practice); fall back to prior mean
    return round(numerator / denominator, 4)


def select_next_item_stub(theta: float, answered_ids: list[str], item_bank: list[dict]) -> dict | None:
    """
    Stub item selection: return next unanswered item ordered by difficulty proximity to theta.
    TODO Phase 8+: replace with Fisher information maximisation.
    """
    unanswered = [i for i in item_bank if i["item_id"] not in answered_ids]
    if not unanswered:
        return None
    # Select item whose difficulty is closest to current theta
    return min(unanswered, key=lambda i: abs(i.get("difficulty_param", 0.0) - theta))


def _fisher_information(theta: float, difficulty: float) -> float:
    """1PL Fisher information: I(theta) = P(theta)*(1 - P(theta))."""
    p = _p_correct(theta, difficulty)
    return p * (1.0 - p)


def select_next_item_eap(theta: float, answered_ids: list[str], item_bank: list[dict]) -> dict | None:
    """
    Select the unanswered item that maximises Fisher information at the
    current theta estimate. Under 1PL this is equivalent to (but computed via
    the real information formula, not a difficulty-distance proxy) picking
    the item whose difficulty is closest to theta.
    """
    unanswered = [i for i in item_bank if i["item_id"] not in answered_ids]
    if not unanswered:
        return None
    return max(unanswered, key=lambda i: _fisher_information(theta, i.get("difficulty_param", 0.0)))


def should_terminate(responses: list[dict], max_items: int = 30) -> bool:
    """
    Stub termination: stop at max_items.
    TODO Phase 8+: terminate when SE(theta) < 0.3.
    """
    return len(responses) >= max_items

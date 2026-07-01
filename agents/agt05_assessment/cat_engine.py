"""
Computerised Adaptive Testing (CAT) engine.

Implements real 1PL (Rasch) IRT psychometrics: EAP theta estimation,
Fisher-information-based item selection, and SE(theta)-based termination.
This is the complete, non-stub implementation for the current 1PL scope.

1PL (Rasch) model:
  P(correct | theta) = 1 / (1 + exp(-(theta - b)))
  Parameter per item: b (difficulty). There is no discrimination (a) or
  guessing (c) parameter, since the real item bank only calibrates a single
  difficulty value per item.

Theta estimation:
  EAP (Expectation A Posteriori) via numerical quadrature over a fixed grid
  (see estimate_theta_eap).

Item selection:
  Fisher information maximisation: I(theta) = P(theta) * (1 - P(theta))
  (see select_next_item_eap / _fisher_information).

CAT termination:
  SE(theta) < 0.3  OR  answered count reaches min(max_items, item_bank_size)
  (see should_terminate_eap / _standard_error).

Deliberately out of scope:
  - True 3PL (discrimination `a` and guessing `c` parameters) — would
    require fabricating calibration data the item bank does not have.
  - Sympson-Hetter exposure control — not needed at the current item bank
    size/usage scale; not part of this module's design.
"""

import math

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
        p = _p_correct(theta, r.get("difficulty_param", 0.0))
        likelihood *= p if r.get("correct") else (1.0 - p)
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


_SE_TERMINATION_THRESHOLD = 0.3
_LARGE_SE_SENTINEL = 999.0


def _standard_error(theta: float, administered_difficulties: list[float]) -> float:
    """SE(theta) = 1 / sqrt(sum of Fisher information across administered items)."""
    total_info = sum(_fisher_information(theta, b) for b in administered_difficulties)
    if total_info <= 0.0:
        return _LARGE_SE_SENTINEL
    return 1.0 / math.sqrt(total_info)


def should_terminate_eap(
    responses: list[dict],
    theta: float,
    item_bank_size: int,
    max_items: int = 30,
) -> bool:
    """
    Terminate when SE(theta) < 0.3, OR when the answered count reaches
    min(max_items, item_bank_size) — whichever comes first. The bank-size cap
    matters because the real item bank (~12 items/skill) is far smaller than
    the default max_items=30, so without this cap the function would never
    naturally terminate via the "max_items reached" path against real data.
    """
    effective_max = min(max_items, item_bank_size)
    if len(responses) >= effective_max:
        return True

    administered_difficulties = [r.get("difficulty_param", 0.0) for r in responses]
    se = _standard_error(theta, administered_difficulties)
    return se < _SE_TERMINATION_THRESHOLD

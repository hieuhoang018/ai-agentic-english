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

from agents.shared.config import settings


def estimate_theta_stub(responses: list[dict]) -> float:
    """
    Stub theta estimation: simple proportion-correct mapped to theta range.
    Full EAP estimation deferred to Phase 8+.
    """
    if not responses:
        return 0.0
    correct = sum(1 for r in responses if r.get("correct", False))
    proportion = correct / len(responses)
    # Linear mapping: 0% correct -> theta=-2.0, 100% correct -> theta=2.0
    return round((proportion * 4.0) - 2.0, 3)


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


def should_terminate(responses: list[dict], max_items: int = 30) -> bool:
    """
    Stub termination: stop at max_items.
    TODO Phase 8+: terminate when SE(theta) < 0.3.
    """
    return len(responses) >= max_items

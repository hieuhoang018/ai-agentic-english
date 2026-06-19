"""
Bayesian Beta distribution vocabulary mastery model.

Each word is characterised by Beta(alpha, beta):
  - alpha counts successful recalls
  - beta  counts failed recalls
  - mastery_score = alpha / (alpha + beta) — point estimate of recall probability

On each encounter: alpha or beta is incremented based on recall success.
"""


def update_beta(alpha: float, beta: float, correct: bool) -> tuple[float, float]:
    """Update Beta distribution parameters after a vocabulary encounter."""
    if correct:
        return alpha + 1.0, beta
    else:
        return alpha, beta + 1.0


def mastery_score(alpha: float, beta: float) -> float:
    """Point estimate of recall probability. Range [0, 1]."""
    total = alpha + beta
    if total == 0:
        return 0.5  # uninformative prior
    return round(alpha / total, 4)


def is_mastered(alpha: float, beta: float, threshold: float = 0.8) -> bool:
    """A word is considered mastered when recall probability >= threshold."""
    return mastery_score(alpha, beta) >= threshold

"""CEFR band mapping shared across agents. Single source of truth."""


def theta_to_cefr(theta: float) -> str:
    """Map IRT theta estimate to CEFR band. Approximate linear mapping."""
    if theta < -1.5:
        return "A1"
    elif theta < -0.5:
        return "A2"
    elif theta < 0.5:
        return "B1"
    elif theta < 1.5:
        return "B2"
    elif theta < 2.5:
        return "C1"
    else:
        return "C2"

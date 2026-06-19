"""
Changepoint detection for learning plateau identification.

STUB — returns no plateaus.
TODO Phase 8+: implement ruptures PELT algorithm.

Full implementation spec:
  - Input: theta time series per skill (ordered by session date)
  - Algorithm: ruptures library, PELT (Pruned Exact Linear Time) method
  - Model: 'rbf' (radial basis function) kernel
  - Plateau definition:
      delta_theta < 0.1 SD over 14-day window
      with >= 5 sessions per skill
      confidence >= 0.8
  - Emit agent.pattern.events with type=plateau when detected
  - Suppress all events if < 5 sessions per skill (cold-start protection)

Install: pip install ruptures>=1.1.9
"""


def detect_plateau(
    theta_series: list[float],
    min_sessions: int = 5,
) -> dict:
    """
    Stub: return no plateau detected.
    TODO Phase 8+: ruptures PELT on theta time series.
    """
    if len(theta_series) < min_sessions:
        return {"plateau": False, "insufficient_data": True}
    return {"plateau": False, "insufficient_data": False, "stub": True}

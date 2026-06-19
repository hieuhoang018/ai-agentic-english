"""
Gaussian Mixture Model for optimal notification timing.

STUB — uses declared preferred time or 20:00 local default.
TODO Phase 8+: implement GMM on session start-time history.

Full implementation spec:
  - Input: behavioral_patterns.session_start_times (list of float hours, e.g. [20.5, 21.0, 19.75])
  - Algorithm: sklearn GaussianMixture, n_components=2 (handles bimodal patterns)
  - Activation: >= 7 session start-time data points collected
  - Output: optimal_hour (float) — peak of dominant GMM component
  - Fallback: declared preferred time from goal_profile, else 20.0

Install: pip install scikit-learn>=1.4.0
"""


def get_optimal_hour(
    session_start_times: list[float],
    declared_hour: float | None = None,
) -> float:
    """
    Stub: return declared hour or 20.0 (8pm) default.
    TODO Phase 8+: fit GMM on session_start_times when >= 7 data points.
    """
    if len(session_start_times) >= 7:
        # TODO Phase 8+: fit GMM and return peak component mean
        pass
    if declared_hour is not None:
        return declared_hour
    return 20.0  # 8pm local time — sensible default for working adults

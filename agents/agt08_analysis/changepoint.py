"""
Changepoint detection for learning plateau identification.

Real implementation: ruptures PELT (Pruned Exact Linear Time) with an 'rbf'
kernel, run on the theta time series. The final segment (from the last
detected changepoint to the end of the series) is checked against the
plateau definition: its slope (last - first value in that segment, divided
by the segment length) must be below a small threshold AND the segment must
span at least min_sessions points.

Suppresses all results if fewer than min_sessions points exist (cold-start
protection — unchanged contract from the prior stub).
"""

import math
import numpy as np
import ruptures as rpt

_PLATEAU_SLOPE_THRESHOLD = 0.1  # per docstring spec: "delta_theta < 0.1 SD"


def detect_plateau(
    theta_series: list[float],
    min_sessions: int = 5,
) -> dict:
    if len(theta_series) < min_sessions:
        return {"plateau": False, "insufficient_data": True}

    algo = rpt.Pelt(model="rbf").fit(_as_2d(theta_series))
    # Penalty scaled to series length, a standard PELT heuristic
    # (coefficient * log(n)). The textbook coefficient of 1.0 was too
    # conservative in practice: on a growth-then-plateau series of length 10
    # (e.g. [0.0, 0.4, 0.8, 1.2, 1.25, 1.22, 1.24, 1.23, 1.25, 1.24]) it
    # found zero internal changepoints, so the "final segment" became the
    # whole series and its endpoint-to-endpoint slope (0.124) narrowly
    # exceeded the 0.1 plateau threshold — a false negative on the textbook
    # plateau shape. Lowering the coefficient to 0.5 makes PELT sensitive
    # enough to split off the flat tail in that case (segment slope drops to
    # 0.004) while still leaving the noisy-but-trending regression case
    # correctly unflagged (segment slope 0.14, still above threshold) and
    # leaving the steadily-increasing case unsplit (whole-series slope 0.25).
    penalty = max(1.0, 0.5 * math.log(len(theta_series)))
    changepoints = algo.predict(pen=penalty)
    # ruptures always includes len(series) as the final "changepoint" (segment
    # boundary), per its documented API contract — strip it before reporting.
    reported_changepoints = [cp for cp in changepoints if cp < len(theta_series)]

    last_segment_start = reported_changepoints[-1] if reported_changepoints else 0
    final_segment = theta_series[last_segment_start:]

    is_plateau = False
    if len(final_segment) >= min_sessions:
        segment_slope = abs(final_segment[-1] - final_segment[0]) / len(final_segment)
        is_plateau = segment_slope < _PLATEAU_SLOPE_THRESHOLD

    return {
        "plateau": is_plateau,
        "insufficient_data": False,
        "changepoints": reported_changepoints,
    }


def _as_2d(series: list[float]):
    """ruptures expects a numpy array of shape (n_samples, n_features); wrap
    each scalar theta value as a length-1 feature vector.

    Deviation from plan: the plan's version returned a plain nested Python
    list, but ruptures' CostRbf.fit() calls `signal.ndim`, which only exists
    on numpy arrays — a plain list raises AttributeError. Wrapping in
    np.array() fixes this real bug (numpy is already a transitive dependency
    of ruptures/scipy, so no new dependency is introduced).
    """
    return np.array([[v] for v in series], dtype=float)

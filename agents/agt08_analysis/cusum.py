"""
CUSUM (Cumulative Sum Control Chart) for persistent error pattern detection.

Real implementation: per (error_type, skill_domain) pair, bucket error_events
by session_id to get a per-session occurrence-count series ordered by time,
then run a standard one-sided CUSUM control chart against that series:

  C_i = max(0, C_{i-1} + (x_i - mu_0 - k))
    x_i   = error rate (count) in session i
    mu_0  = baseline rate, fixed at 0 (the "no errors" ideal). No separate
            historical control baseline exists in this system yet, and using
            the series' own mean as mu_0 would be mathematically inert for a
            constant-rate series (x_i - mu_0 is always 0), which would make
            it impossible to ever flag a sustained, unimproving error rate —
            exactly the case persistent-weakness detection needs to catch.
    sigma = sample std dev of the series (population stdev; falls back to a
            floor of 0.5 when the series is perfectly constant and pstdev
            would otherwise be 0, which would make sigma-scaled k/h collapse
            to 0 and trivially alert on any nonzero rate)
    k     = slack value, 0.5 * sigma
  Alert when C_i > h * sigma (h=5, the standard CUSUM recommendation)
  Confirm: only report types with at least 3 sessions where the type occurred
  (keeps it consistent with the original "frequency >= 3" spirit while now
  also requiring the alert to be control-chart-significant, not just a count)
"""

import statistics
from collections import defaultdict


def _compute_cusum_series(rates: list[float], mu_0: float, k: float) -> list[float]:
    """One-sided CUSUM statistic series. Never goes negative (reset-on-drop)."""
    series = []
    c_prev = 0.0
    for x in rates:
        c_i = max(0.0, c_prev + (x - mu_0 - k))
        series.append(c_i)
        c_prev = c_i
    return series


def detect_persistent_errors(
    error_history: list[dict],
    min_sessions: int = 5,
) -> list[dict]:
    """
    Returns error types whose CUSUM control-chart statistic exceeds the alert
    threshold (h=5 * sigma), per (error_type, skill_domain) pair.
    Suppresses all results if fewer than min_sessions distinct sessions exist
    in the input (cold-start protection, same contract as the prior stub).
    """
    sessions_seen = {e.get("session_id") for e in error_history if e.get("session_id")}
    if len(sessions_seen) < min_sessions:
        return []

    # Group by (error_type, skill_domain) -> ordered list of (created_at, session_id)
    by_key: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for e in error_history:
        etype = e.get("error_type")
        skill = e.get("skill_domain", "UNKNOWN")
        if not etype:
            continue
        by_key[(etype, skill)].append(e)

    # All sessions, ordered by time, used as the common timeline for rate-per-session.
    ordered_sessions = sorted(sessions_seen, key=lambda sid: _earliest_time_for_session(error_history, sid))

    results = []
    for (etype, skill), events in by_key.items():
        occurrence_count = sum(1 for s in ordered_sessions if _session_has_error(events, s))
        if occurrence_count < 3:
            continue  # same minimum-occurrence floor as the original frequency stub

        rates = [1.0 if _session_has_error(events, s) else 0.0 for s in ordered_sessions]
        # Baseline is fixed at 0 (the "no errors" ideal), not the series' own mean.
        # A self-referential mean baseline (mu_0 = mean(rates)) is mathematically
        # inert against a constant-rate series: every x_i - mu_0 term is 0, so the
        # CUSUM statistic can never rise above 0 no matter how sustained/high the
        # error rate is. That defeats the purpose of "persistent weakness"
        # detection, which specifically needs to catch a rate that is sustained
        # and non-improving, not just a rate that is trending relative to itself.
        # Zero is a defensible fixed baseline here since no separate historical
        # control baseline exists in this system yet, and "zero errors" is the
        # natural target state for any error_type/skill_domain pair.
        mu_0 = 0.0
        sigma = statistics.pstdev(rates) or 0.5  # avoid zero-sigma when rate is constant
        k = 0.5 * sigma
        series = _compute_cusum_series(rates, mu_0, k)
        h_threshold = 5 * sigma

        if series[-1] > h_threshold:
            results.append({
                "error_type": etype,
                "skill_domain": skill,
                "count": occurrence_count,
                "cusum_statistic": round(series[-1], 4),
            })

    return results


def _session_has_error(events: list[dict], session_id: str) -> bool:
    return any(e.get("session_id") == session_id for e in events)


def _earliest_time_for_session(error_history: list[dict], session_id: str) -> str:
    times = [e.get("created_at", "") for e in error_history if e.get("session_id") == session_id]
    return min(times) if times else ""

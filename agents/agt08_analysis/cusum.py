"""
CUSUM (Cumulative Sum Control Chart) for persistent error pattern detection.

STUB — returns empty results.
TODO Phase 8+: implement full CUSUM analysis.

Full implementation spec:
  - Maintain CUSUM statistic C_i per error category per skill domain per user
  - C_i = max(0, C_{i-1} + (x_i - mu_0 - k))
    where x_i = error rate in session i
          mu_0 = baseline error rate (historical mean for this category)
          k = slack value (typically 0.5 * sigma)
  - Alert threshold: C_i > h * sigma (h=5 recommended)
  - Confirm: alert sustained for >= 3 consecutive sessions
  - Emit agent.pattern.events with type=persistent_weakness
"""


def detect_persistent_errors(
    error_history: list[dict],
    min_sessions: int = 5,
) -> list[dict]:
    """
    Returns error types that appear >= 3 times across all recorded sessions.
    Suppresses all results if fewer than min_sessions sessions exist.

    This is a frequency-threshold approximation of CUSUM persistent detection,
    used until full CUSUM (control-limit chart per skill domain) is implemented
    in Phase 8+.
    """
    if len(error_history) < min_sessions:
        return []

    from collections import Counter
    counts = Counter(
        e.get("error_type") for e in error_history if e.get("error_type")
    )
    return [
        {
            "error_type": etype,
            "count": count,
            "skill_domain": next(
                (e.get("skill_domain") for e in error_history
                 if e.get("error_type") == etype),
                "UNKNOWN",
            ),
        }
        for etype, count in counts.items()
        if count >= 3
    ]

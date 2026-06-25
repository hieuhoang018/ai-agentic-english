"""
Pedagogical feedback strategy selection.

Three strategies in order of escalation:
  RECAST         — untaught error: tutor restates correctly without explicit comment
  METALINGUISTIC — taught error, <3 prior failures: explicit rule explanation
  ELICITATION    — taught error, >=3 failures: ask learner to self-correct

Feedback throttling:
  >3 error types in a single turn → surface only highest-severity, log all.
"""

from enum import Enum

FILLER_WORDS = {"um", "uh", "like", "basically", "literally", "actually", "so"}

# Severity order for throttling (higher = more important to surface)
ERROR_SEVERITY = {
    "grammar": 4,
    "vocabulary": 3,
    "pronunciation": 2,
    "fluency": 1,
    "coherence": 3,
    "register": 3,
}

THROTTLE_THRESHOLD = 3  # more than this many error types → throttle


class FeedbackStrategy(str, Enum):
    RECAST = "recast"
    METALINGUISTIC = "metalinguistic"
    ELICITATION = "elicitation"


def select_strategy(
    error_type: str,
    is_taught: bool,
    failure_count: int,
) -> FeedbackStrategy:
    """
    Select the feedback strategy for a given error.
    is_taught: whether this error category has been explicitly taught in past sessions.
    failure_count: number of times the learner has failed to self-correct this category.
    """
    if not is_taught:
        return FeedbackStrategy.RECAST
    if failure_count < 3:
        return FeedbackStrategy.METALINGUISTIC
    return FeedbackStrategy.ELICITATION


def should_throttle(error_types_this_turn: list[str]) -> tuple[bool, str | None]:
    """
    Determine if feedback should be throttled to the highest-priority error only.
    Returns (throttled: bool, priority_error_type: str | None).
    """
    if len(error_types_this_turn) <= THROTTLE_THRESHOLD:
        return False, None
    priority = max(error_types_this_turn, key=lambda e: ERROR_SEVERITY.get(e, 0))
    return True, priority

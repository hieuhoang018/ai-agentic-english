"""
Fluency metrics derivable from transcript text and audio timing.
No GPU or paid API required — computed from Whisper transcript data.

Metrics:
  words_per_minute   — speech rate
  filler_density     — proportion of filler words (um, uh, like, etc.)
  pause_frequency    — long pauses per minute (requires audio timing, optional)
"""

from agents.agt04_feedback.pedagogical import FILLER_WORDS


def compute_wpm(transcript: str, duration_seconds: float) -> float:
    """Words per minute. Returns 0.0 if duration is zero or too short."""
    if duration_seconds < 1.0:
        return 0.0
    word_count = len(transcript.split())
    return round((word_count / duration_seconds) * 60.0, 1)


def compute_filler_density(transcript: str) -> float:
    """
    Proportion of tokens that are filler words.
    Range [0.0, 1.0]. Native speakers typically < 0.05.
    """
    tokens = transcript.lower().split()
    if not tokens:
        return 0.0
    filler_count = sum(1 for t in tokens if t.strip(".,!?") in FILLER_WORDS)
    return round(filler_count / len(tokens), 4)


def compute_fluency_metrics(transcript: str, duration_seconds: float) -> dict:
    """
    Compute all available fluency metrics.
    pause_frequency is a placeholder until audio timing data is available.
    """
    return {
        "words_per_minute": compute_wpm(transcript, duration_seconds),
        "filler_density": compute_filler_density(transcript),
        "word_count": len(transcript.split()),
        "duration_seconds": round(duration_seconds, 1),
        # TODO Phase 8+: add pause_frequency when audio timing data is available
        "pause_frequency": None,
    }

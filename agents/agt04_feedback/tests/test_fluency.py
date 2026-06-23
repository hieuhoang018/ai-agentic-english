from agents.agt04_feedback.fluency import compute_wpm, compute_filler_density, compute_fluency_metrics


# ── compute_wpm ──────────────────────────────────────────────────────────────

def test_wpm_zero_duration_returns_zero():
    assert compute_wpm("hello world", 0.0) == 0.0


def test_wpm_sub_second_duration_returns_zero():
    assert compute_wpm("hello world", 0.5) == 0.0


def test_wpm_exact_calculation():
    # 60 words in 60 seconds = 60.0 WPM
    text = " ".join(["word"] * 60)
    assert compute_wpm(text, 60.0) == 60.0


def test_wpm_typical_speaking_rate():
    # 150 words in 60 seconds = 150.0 WPM
    text = " ".join(["word"] * 150)
    assert compute_wpm(text, 60.0) == 150.0


def test_wpm_returns_rounded_to_one_decimal():
    # 1 word in 3 seconds = 20.0 WPM
    result = compute_wpm("word", 3.0)
    assert result == 20.0


# ── compute_filler_density ───────────────────────────────────────────────────

def test_filler_density_empty_string_returns_zero():
    assert compute_filler_density("") == 0.0


def test_filler_density_no_fillers():
    assert compute_filler_density("I went to the market yesterday") == 0.0


def test_filler_density_all_fillers():
    assert compute_filler_density("um uh like") == 1.0


def test_filler_density_half_fillers():
    result = compute_filler_density("um hello uh world")
    assert result == 0.5


def test_filler_density_ignores_punctuation_on_filler_word():
    # "um," should still match the filler "um"
    result = compute_filler_density("um, that was basically good")
    assert result > 0.0


def test_filler_density_you_know_not_counted_as_filler():
    # "you" and "know" individually are not fillers — multi-word entry was removed
    result = compute_filler_density("you know what I mean")
    assert result == 0.0


def test_filler_density_range_is_zero_to_one():
    result = compute_filler_density("um uh like basically literally actually so")
    assert 0.0 <= result <= 1.0


# ── compute_fluency_metrics ──────────────────────────────────────────────────

def test_compute_fluency_metrics_keys_present():
    result = compute_fluency_metrics("hello world um", 10.0)
    for key in ("words_per_minute", "filler_density", "word_count", "duration_seconds", "pause_frequency"):
        assert key in result, f"Missing key: {key}"


def test_compute_fluency_metrics_pause_frequency_is_none():
    result = compute_fluency_metrics("hello world", 10.0)
    assert result["pause_frequency"] is None


def test_compute_fluency_metrics_word_count():
    result = compute_fluency_metrics("one two three", 30.0)
    assert result["word_count"] == 3


def test_compute_fluency_metrics_duration_seconds_rounded():
    result = compute_fluency_metrics("hello", 10.123)
    assert result["duration_seconds"] == 10.1

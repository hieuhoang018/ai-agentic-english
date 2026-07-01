"""
Tests for AGT-08 real PELT changepoint detection (detect_plateau).

A "plateau" here means: the most recent segment of the theta series, per
ruptures' PELT segmentation, has near-zero slope (< 0.1 SD per the original
docstring spec) and spans at least min_sessions points.
"""

from agents.agt08_analysis.changepoint import detect_plateau


def test_empty_series_returns_insufficient_data():
    result = detect_plateau([])
    assert result["insufficient_data"] is True
    assert result["plateau"] is False


def test_fewer_than_min_sessions_returns_insufficient_data():
    result = detect_plateau([0.0, 0.1, 0.2, 0.3])  # 4 items, min=5
    assert result["insufficient_data"] is True
    assert result["plateau"] is False


def test_steadily_increasing_series_is_not_a_plateau():
    """Theta climbing steadily (real improvement) must NOT be flagged as a plateau."""
    series = [0.0, 0.3, 0.6, 0.9, 1.2, 1.5]
    result = detect_plateau(series)
    assert result["insufficient_data"] is False
    assert result["plateau"] is False


def test_flat_recent_segment_after_growth_is_a_plateau():
    """Growth followed by a sustained flat tail (the textbook plateau shape)
    must be detected."""
    series = [0.0, 0.4, 0.8, 1.2, 1.25, 1.22, 1.24, 1.23, 1.25, 1.24]
    result = detect_plateau(series, min_sessions=5)
    assert result["insufficient_data"] is False
    assert result["plateau"] is True


def test_entirely_flat_series_is_a_plateau():
    series = [1.0] * 8
    result = detect_plateau(series, min_sessions=5)
    assert result["plateau"] is True


def test_result_includes_changepoint_indices_when_plateau_detected():
    series = [0.0, 0.4, 0.8, 1.2, 1.25, 1.22, 1.24, 1.23, 1.25, 1.24]
    result = detect_plateau(series, min_sessions=5)
    assert "changepoints" in result
    assert isinstance(result["changepoints"], list)


def test_noisy_but_trending_series_is_not_a_plateau():
    """Noisy data with a real overall upward trend must not falsely plateau —
    this guards against an overly sensitive flat-segment threshold."""
    series = [0.0, 0.5, 0.3, 0.9, 0.7, 1.3, 1.1, 1.7, 1.5, 2.0]
    result = detect_plateau(series, min_sessions=5)
    assert result["plateau"] is False

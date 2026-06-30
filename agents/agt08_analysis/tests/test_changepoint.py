"""
Tests for AGT-08 detect_plateau (changepoint detection stub).

These tests document the CURRENT stub behaviour. When Phase 8+ replaces the
stub with ruptures PELT, each test here becomes a regression guard that forces
the real algorithm to handle the documented boundary conditions.
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


def test_exactly_min_sessions_reaches_stub_branch():
    result = detect_plateau([0.0, 0.0, 0.0, 0.0, 0.0])  # exactly 5
    assert result.get("insufficient_data") is False
    assert result["plateau"] is False  # stub always returns no plateau


def test_above_min_sessions_returns_stub_true():
    result = detect_plateau([0.0] * 10)
    assert result.get("stub") is True
    assert result["plateau"] is False

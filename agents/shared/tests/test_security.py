import pytest

from agents.shared.security import assert_internal_secret_is_safe


def test_raises_when_live_and_default_secret():
    with pytest.raises(RuntimeError, match="INTERNAL_SECRET"):
        assert_internal_secret_is_safe("dev-internal-secret", "live")


def test_raises_when_live_and_empty_secret():
    with pytest.raises(RuntimeError, match="INTERNAL_SECRET"):
        assert_internal_secret_is_safe("", "live")


def test_raises_when_live_and_whitespace_only_secret():
    with pytest.raises(RuntimeError, match="INTERNAL_SECRET"):
        assert_internal_secret_is_safe("   ", "live")


def test_does_not_raise_when_mock_mode_even_with_default_secret():
    assert_internal_secret_is_safe("dev-internal-secret", "mock")


def test_does_not_raise_when_live_and_real_secret():
    assert_internal_secret_is_safe("a-real-production-secret", "live")

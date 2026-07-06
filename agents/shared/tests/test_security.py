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


def test_raises_when_live_and_default_secret_padded_with_whitespace():
    """Regression test: the emptiness check and the dev-default comparison
    must use the same normalized value. Previously the emptiness check
    stripped the secret but the equality check compared the raw string, so
    " dev-internal-secret " (e.g. a stray space from a pasted .env value)
    passed the emptiness check (non-empty) and failed the equality check
    (not an exact match) -- silently bypassing the guard entirely."""
    with pytest.raises(RuntimeError, match="INTERNAL_SECRET"):
        assert_internal_secret_is_safe(" dev-internal-secret ", "live")


def test_raises_when_live_and_default_secret_has_trailing_newline():
    with pytest.raises(RuntimeError, match="INTERNAL_SECRET"):
        assert_internal_secret_is_safe("dev-internal-secret\n", "live")

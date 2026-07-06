import pytest

from agents.shared.config import Settings


def test_settings_raises_when_live_mode_keeps_default_secret(monkeypatch):
    monkeypatch.setenv("INFERENCE_MODE", "live")
    monkeypatch.delenv("INTERNAL_SECRET", raising=False)

    with pytest.raises(RuntimeError, match="INTERNAL_SECRET"):
        Settings()


def test_settings_raises_when_live_mode_has_empty_secret(monkeypatch):
    monkeypatch.setenv("INFERENCE_MODE", "live")
    monkeypatch.setenv("INTERNAL_SECRET", "")

    with pytest.raises(RuntimeError, match="INTERNAL_SECRET"):
        Settings()


def test_settings_ok_in_mock_mode_with_default_secret(monkeypatch):
    monkeypatch.setenv("INFERENCE_MODE", "mock")
    monkeypatch.delenv("INTERNAL_SECRET", raising=False)

    settings = Settings()

    assert settings.INTERNAL_SECRET == "dev-internal-secret"


def test_settings_ok_in_live_mode_with_real_secret(monkeypatch):
    monkeypatch.setenv("INFERENCE_MODE", "live")
    monkeypatch.setenv("INTERNAL_SECRET", "a-real-production-secret")

    settings = Settings()

    assert settings.INTERNAL_SECRET == "a-real-production-secret"

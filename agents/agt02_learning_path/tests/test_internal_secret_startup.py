import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

import pytest

MODULE_PATH = Path(__file__).resolve().parents[1] / "service.py"


def _load_service_fresh():
    """Load agt02_learning_path/service.py as an independent module object.

    Uses spec_from_file_location instead of importlib.reload/import so this
    never touches sys.modules['agents.agt02_learning_path.service'] — the
    real cached module that test_service.py, test_consumers.py, and
    test_optimizer.py import and rely on staying intact.

    Note (learned the hard way on agt_orchestrator/main.py's equivalent
    guard): this module transitively imports agents.shared.llm.router,
    which imports agents.shared.config, whose Settings() singleton has its
    OWN guard on the *different* INTERNAL_SECRET field. If that singleton
    hasn't been constructed yet in this process, constructing it here
    (via the transitive import) could raise first — before this module's
    own LM_INTERNAL_SECRET check ever runs — if INTERNAL_SECRET is also
    left unsafe. To keep the "raises" test unambiguous, always set
    INTERNAL_SECRET to a distinct, safe value in tests that only intend to
    exercise LM_INTERNAL_SECRET's own guard.
    """
    spec = importlib.util.spec_from_file_location("agt02_service_under_test", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_refuses_to_load_with_default_lm_secret_in_live_mode(monkeypatch):
    monkeypatch.setenv("INFERENCE_MODE", "live")
    monkeypatch.setenv("INTERNAL_SECRET", "a-safe-unrelated-secret")
    monkeypatch.delenv("LM_INTERNAL_SECRET", raising=False)

    with pytest.raises(RuntimeError, match="INTERNAL_SECRET"):
        _load_service_fresh()


def test_loads_fine_with_real_lm_secret_in_live_mode(monkeypatch):
    monkeypatch.setenv("INFERENCE_MODE", "live")
    monkeypatch.setenv("INTERNAL_SECRET", "a-safe-unrelated-secret")
    monkeypatch.setenv("LM_INTERNAL_SECRET", "a-real-production-secret")

    module = _load_service_fresh()

    assert module.LM_INTERNAL_SECRET == "a-real-production-secret"


def test_loads_fine_in_mock_mode_with_default_lm_secret(monkeypatch):
    monkeypatch.setenv("INFERENCE_MODE", "mock")
    monkeypatch.delenv("LM_INTERNAL_SECRET", raising=False)

    module = _load_service_fresh()

    assert module.LM_INTERNAL_SECRET == "dev-internal-secret"


def test_calls_assert_internal_secret_is_safe_with_current_env_values(monkeypatch):
    """Proves service.py's own line reaches and calls the guard with the right
    arguments — independent of whether agents.shared.config's Settings()
    singleton (a separate guard, checking a different field) happens to
    construct first due to import-cache ordering in a given process."""
    monkeypatch.setenv("INFERENCE_MODE", "mock")
    monkeypatch.setenv("LM_INTERNAL_SECRET", "some-secret-value")
    spy = MagicMock()
    monkeypatch.setattr("agents.shared.security.assert_internal_secret_is_safe", spy)

    _load_service_fresh()

    spy.assert_called_once_with("some-secret-value", "mock")

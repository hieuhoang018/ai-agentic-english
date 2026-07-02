import importlib.util
from pathlib import Path

import pytest

MAIN_PATH = Path(__file__).resolve().parents[1] / "main.py"


def _load_main_fresh():
    """Load agt_orchestrator/main.py as an independent module object.

    Uses spec_from_file_location instead of importlib.reload/import so this
    never touches sys.modules['agents.agt_orchestrator.main'] — the real
    cached module that test_grading.py, test_lifespan.py, and
    test_onboarding.py import and rely on staying intact.
    """
    spec = importlib.util.spec_from_file_location("agt_orchestrator_main_under_test", MAIN_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_refuses_to_load_with_default_secret_in_live_mode(monkeypatch):
    monkeypatch.setenv("INFERENCE_MODE", "live")
    monkeypatch.delenv("INTERNAL_SECRET", raising=False)

    with pytest.raises(RuntimeError, match="INTERNAL_SECRET"):
        _load_main_fresh()


def test_loads_fine_with_real_secret_in_live_mode(monkeypatch):
    monkeypatch.setenv("INFERENCE_MODE", "live")
    monkeypatch.setenv("INTERNAL_SECRET", "a-real-production-secret")

    module = _load_main_fresh()

    assert module.app is not None
    assert module.INTERNAL_SECRET == "a-real-production-secret"


def test_loads_fine_in_mock_mode_with_default_secret(monkeypatch):
    monkeypatch.setenv("INFERENCE_MODE", "mock")
    monkeypatch.delenv("INTERNAL_SECRET", raising=False)

    module = _load_main_fresh()

    assert module.app is not None
    assert module.INTERNAL_SECRET == "dev-internal-secret"

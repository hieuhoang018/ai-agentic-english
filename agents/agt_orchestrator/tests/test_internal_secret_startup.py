import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

import pytest

MAIN_PATH = Path(__file__).resolve().parents[1] / "main.py"


def _load_main_fresh():
    """Load agt_orchestrator/main.py as an independent module object.

    Uses spec_from_file_location instead of importlib.reload/import so this
    never touches sys.modules['agents.agt_orchestrator.main'] — the real
    cached module that test_grading.py, test_lifespan.py, and
    test_onboarding.py import and rely on staying intact.

    Caveat: this does NOT force a fresh import of agents.shared.config.
    main.py's line 9 (`from agents.shared.events.producer import ...`)
    transitively imports agents.shared.config, whose module-level
    `settings = Settings()` singleton runs its own INTERNAL_SECRET guard
    (wired in Task 2) as a pydantic validator. Whether that guard or
    main.py's own `assert_internal_secret_is_safe(...)` call (line 20) is
    the one that actually raises depends on whether agents.shared.config is
    already present in sys.modules when this function runs:

    - Cold process / not yet cached: agents.shared.config's Settings()
      validator fires FIRST, during the transitive import at main.py's
      line 9 — before main.py's own line 20 ever executes.
    - Already cached (e.g. another test module imported agents.shared.config
      earlier in the same session): reconstructing main.py here reuses the
      cached module, so Settings() does NOT run again, and only main.py's
      own line 20 can raise.

    Because of this, test_refuses_to_load_with_default_secret_in_live_mode
    below cannot by itself prove that main.py's own call site works — it may
    pass simply because Task 2's guard raised first via the transitive
    import, and the test has no way to distinguish which guard fired.
    test_calls_assert_internal_secret_is_safe_with_current_env_values exists
    specifically to close that gap: it patches assert_internal_secret_is_safe
    at its origin (agents.shared.security) and asserts it is reached and
    called with the right arguments, independent of import-cache ordering.
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


def test_calls_assert_internal_secret_is_safe_with_current_env_values(monkeypatch):
    """Proves main.py's own line reaches and calls the guard with the right
    arguments — independent of whether agents.shared.config's Settings()
    singleton (a separate guard, wired in Task 2) happens to raise first due
    to import-cache ordering. See the module docstring above (in
    _load_main_fresh) for why that ordering concern is real and this test
    closes the gap.

    We patch assert_internal_secret_is_safe at its origin
    (agents.shared.security), not on main.py's own module object, because
    _load_main_fresh() creates a brand-new module each call — there's no
    "agents.agt_orchestrator.main" attribute path to patch beforehand.
    main.py's `from agents.shared.security import assert_internal_secret_is_safe`
    executes during exec_module, i.e. after we've already patched the
    origin, so the fresh module's from-import binds our spy instead of the
    real function.

    INFERENCE_MODE=mock is used deliberately so that even if the real,
    unpatched guard were somehow still in the path via a cached
    agents.shared.config singleton from a prior test, it could not itself
    raise and mask this assertion. This test only proves the call happens
    with the right arguments; the raising behavior is already covered by
    the other tests in this file.
    """
    monkeypatch.setenv("INFERENCE_MODE", "mock")
    monkeypatch.setenv("INTERNAL_SECRET", "some-secret-value")
    spy = MagicMock()
    monkeypatch.setattr("agents.shared.security.assert_internal_secret_is_safe", spy)

    _load_main_fresh()

    spy.assert_called_once_with("some-secret-value", "mock")

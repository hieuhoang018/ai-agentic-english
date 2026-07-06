"""
Regression test for a gap the unit-level tests (test_config.py, test_security.py)
could not catch: those prove Settings()/assert_internal_secret_is_safe raise
correctly in isolation, but nothing verified that infra/docker-compose.prod.yml
actually supplies a real INTERNAL_SECRET to every service whose process enforces
that guard. It originally only did for 6 of 12 agent services.

Every agent's main entrypoint transitively imports agents.shared.config (via
agents.shared.db.postgres/redis_client, agents.shared.events.producer/consumer,
or agents.shared.llm.router -- Postgres/Redis/Kafka/LLM access is universal
across the fleet), which constructs the shared Settings() singleton at import
time and raises RuntimeError under INFERENCE_MODE=live if INTERNAL_SECRET is
still the literal "dev-internal-secret" -- regardless of whether that specific
agent has any internal-secret-gated HTTP route of its own. Verified directly:
`INFERENCE_MODE=live python -c "import agents.agt01_profiling.main"` and
`...agt08_analysis.consumers` both raise, even though neither AGT-01 nor AGT-08
sends/checks an x-internal-secret header anywhere.
"""
from __future__ import annotations

from pathlib import Path

import yaml

INFRA_DIR = Path(__file__).resolve().parents[3] / "infra"
COMPOSE_BASE = INFRA_DIR / "docker-compose.yml"
COMPOSE_PROD = INFRA_DIR / "docker-compose.prod.yml"

AGENT_SERVICES_REQUIRING_INTERNAL_SECRET = [
    "agt01-profiling",
    "agt02-learning-path",
    "agt03-tutor",
    "agt04-feedback",
    "agt05-assessment",
    "agt06-memory",
    "agt07-review",
    "agt08-analysis",
    "agt09-recommendation",
    "agt10-habit",
    "agt11-translation",
    "agt-orchestrator",
]


def _load(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def _service_env(compose: dict, service_name: str) -> dict:
    return (compose.get("services", {}).get(service_name) or {}).get("environment") or {}


def _effective_env_value(service_name: str, key: str) -> str | None:
    """Mirrors `docker compose -f docker-compose.yml -f docker-compose.prod.yml config`'s
    per-key environment merge for one service: prod overrides win key-by-key;
    base values survive for keys prod doesn't touch (a full-block replacement
    would be the wrong model here -- compose merges environment maps)."""
    base_env = _service_env(_load(COMPOSE_BASE), service_name)
    prod_env = _service_env(_load(COMPOSE_PROD), service_name)
    merged = {**base_env, **prod_env}
    return merged.get(key)


def test_every_agent_gets_a_real_internal_secret_reference_in_prod():
    """The actual bug this test targets: docker-compose.prod.yml overriding
    INTERNAL_SECRET for only some services while INFERENCE_MODE=live is set
    for all of them. A merged value of the literal "dev-internal-secret" means
    the prod override is silently absent for that service -- it would crash-loop
    on startup (Settings() raises) since the base file's dev default survives
    the merge unless prod explicitly overrides it."""
    failures = []
    for service in AGENT_SERVICES_REQUIRING_INTERNAL_SECRET:
        value = _effective_env_value(service, "INTERNAL_SECRET")
        if value is None:
            failures.append(f"{service}: INTERNAL_SECRET not set at all (base or prod)")
        elif value == "dev-internal-secret":
            failures.append(
                f"{service}: INTERNAL_SECRET still resolves to the hardcoded dev "
                "default after merging prod override -- prod.yml is missing an "
                "override for this service"
            )

    assert not failures, "\n" + "\n".join(failures)


def test_agt02_lm_internal_secret_also_gets_a_real_prod_reference():
    """AGT-02 reads LM_INTERNAL_SECRET as a second, separate env var (not via
    the shared Settings class) and calls assert_internal_secret_is_safe on it
    directly in service.py -- this is in addition to, not instead of, the
    generic INTERNAL_SECRET check covered by the test above."""
    value = _effective_env_value("agt02-learning-path", "LM_INTERNAL_SECRET")
    assert value is not None, "agt02-learning-path: LM_INTERNAL_SECRET not set at all"
    assert value != "dev-internal-secret", (
        "agt02-learning-path: LM_INTERNAL_SECRET still resolves to the hardcoded dev default"
    )


def test_dev_compose_alone_keeps_the_convenient_default():
    """Sanity check protecting local dev ergonomics: without the prod overlay,
    every agent must still resolve INTERNAL_SECRET to the dev default (harmless,
    since INFERENCE_MODE stays "mock" there and the guard never fires). This
    would fail if someone "fixed" the prod gap by deleting the dev default
    instead of adding a prod override."""
    base = _load(COMPOSE_BASE)
    for service in AGENT_SERVICES_REQUIRING_INTERNAL_SECRET:
        env = _service_env(base, service)
        assert env.get("INTERNAL_SECRET", "dev-internal-secret") == "dev-internal-secret", (
            f"{service}: dev compose no longer defaults INTERNAL_SECRET, "
            "breaking local dev without a .env file"
        )

"""
Tests for AGT-03 app-level behavior (main.py): lifespan resilience to a
Kafka outage at startup.
"""
from unittest.mock import AsyncMock

from agents.agt03_tutor import main as main_module


async def test_lifespan_does_not_crash_when_kafka_producer_is_unreachable(monkeypatch):
    """
    Regression test for a real production incident: main.py's lifespan used
    to `await get_producer()` unprotected, so a Kafka outage at container
    boot crashed the whole app ("Application startup failed. Exiting.") and
    relied on Docker's restart policy to eventually retry — fragile, and
    for a sibling agent using the same eager-call pattern for its Kafka
    CONSUMER instead (a fire-and-forget asyncio.create_task), the
    equivalent failure was silent and permanent with no restart ever
    triggered. The producer call must now tolerate a Kafka outage at
    startup, matching agents/agt_orchestrator/main.py's existing pattern.
    """
    monkeypatch.setattr(main_module, "get_pool", AsyncMock())
    monkeypatch.setattr(main_module, "get_redis", AsyncMock())
    monkeypatch.setattr(
        main_module, "get_producer",
        AsyncMock(side_effect=Exception("Unable to bootstrap from [('kafka', 9092)]")),
    )
    monkeypatch.setattr(main_module, "close_pool", AsyncMock())
    monkeypatch.setattr(main_module, "close_redis", AsyncMock())
    monkeypatch.setattr(main_module, "close_producer", AsyncMock())

    async with main_module.lifespan(main_module.app):
        pass  # must not raise even though get_producer() raised inside

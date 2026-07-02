from unittest.mock import AsyncMock

from agents.agt_orchestrator.main import app, lifespan


async def test_lifespan_starts_even_when_kafka_producer_unavailable(monkeypatch):
    """A Kafka broker outage at boot must not prevent the app from starting."""
    monkeypatch.setattr(
        "agents.agt_orchestrator.main.get_producer",
        AsyncMock(side_effect=Exception("Kafka broker unreachable")),
    )
    monkeypatch.setattr("agents.agt_orchestrator.main.close_producer", AsyncMock())

    async with lifespan(app):
        pass

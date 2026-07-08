"""
Tests for agents/shared/events/producer.py's resilience to Kafka being
unreachable — a real production incident where a producer that failed to
start on its first use stayed permanently broken for the rest of the
process's life, and where emit()'s documented "never raises" contract
didn't actually hold for failures during producer acquisition.
"""
from unittest.mock import AsyncMock, MagicMock

import pytest

import agents.shared.events.producer as producer_module


@pytest.fixture(autouse=True)
def reset_producer_singleton():
    """The module caches a producer in a global — reset it before and after
    every test so tests don't leak state into each other."""
    producer_module._producer = None
    yield
    producer_module._producer = None


async def test_get_producer_starts_and_caches_a_new_producer(monkeypatch):
    fake_producer = AsyncMock()
    fake_producer_cls = MagicMock(return_value=fake_producer)
    monkeypatch.setattr(producer_module, "AIOKafkaProducer", fake_producer_cls)

    result = await producer_module.get_producer()

    assert result is fake_producer
    fake_producer.start.assert_awaited_once()

    # A second call must reuse the cached instance, not construct a new one.
    result2 = await producer_module.get_producer()
    assert result2 is fake_producer
    fake_producer_cls.assert_called_once()


async def test_get_producer_does_not_cache_a_producer_that_failed_to_start(monkeypatch):
    """The actual bug: a failed .start() must not poison the module global,
    or every future call returns the same broken, never-started producer
    forever instead of retrying once Kafka becomes reachable again."""
    failing_producer = AsyncMock()
    failing_producer.start.side_effect = Exception("Unable to bootstrap from [('kafka', 9092)]")
    working_producer = AsyncMock()
    fake_producer_cls = MagicMock(side_effect=[failing_producer, working_producer])
    monkeypatch.setattr(producer_module, "AIOKafkaProducer", fake_producer_cls)

    with pytest.raises(Exception, match="Unable to bootstrap"):
        await producer_module.get_producer()

    # A later call must construct and start a FRESH producer, not reuse the broken one.
    result = await producer_module.get_producer()

    assert result is working_producer
    assert fake_producer_cls.call_count == 2


async def test_emit_never_raises_when_producer_fails_to_start(monkeypatch):
    """emit()'s docstring promises it never raises — this must hold even
    when the failure happens acquiring/starting the producer, not just when
    sending a message on an already-working one."""
    broken_producer = AsyncMock()
    broken_producer.start.side_effect = Exception("Unable to bootstrap from [('kafka', 9092)]")
    monkeypatch.setattr(producer_module, "AIOKafkaProducer", MagicMock(return_value=broken_producer))

    await producer_module.emit("session.end", {"sessionId": "abc"}, agent_id="AGT03")


async def test_emit_ts_event_never_raises_when_producer_fails_to_start(monkeypatch):
    broken_producer = AsyncMock()
    broken_producer.start.side_effect = Exception("Unable to bootstrap from [('kafka', 9092)]")
    monkeypatch.setattr(producer_module, "AIOKafkaProducer", MagicMock(return_value=broken_producer))

    await producer_module.emit_ts_event("achievement.unlocked", "achievement.unlocked", {"userId": "u1"})


async def test_emit_sends_event_with_envelope_when_producer_available(monkeypatch):
    fake_producer = AsyncMock()
    monkeypatch.setattr(producer_module, "AIOKafkaProducer", MagicMock(return_value=fake_producer))

    await producer_module.emit("session.end", {"sessionId": "abc"}, agent_id="AGT03", key="abc")

    fake_producer.send.assert_awaited_once()
    call_args = fake_producer.send.call_args
    assert call_args.args[0] == "session.end"
    sent_value = call_args.kwargs["value"]
    assert sent_value["sessionId"] == "abc"
    assert sent_value["agentId"] == "AGT03"
    assert "eventId" in sent_value


async def test_emit_recovers_on_the_next_call_after_a_startup_failure(monkeypatch):
    """End-to-end proof of the fix: emit() must not raise on a Kafka outage,
    AND a later emit() (once Kafka is back) must actually succeed instead of
    forever hitting the same poisoned producer."""
    failing_producer = AsyncMock()
    failing_producer.start.side_effect = Exception("Unable to bootstrap from [('kafka', 9092)]")
    working_producer = AsyncMock()
    fake_producer_cls = MagicMock(side_effect=[failing_producer, working_producer])
    monkeypatch.setattr(producer_module, "AIOKafkaProducer", fake_producer_cls)

    await producer_module.emit("session.end", {"sessionId": "abc"}, agent_id="AGT03")  # Kafka down, swallowed
    await producer_module.emit("session.end", {"sessionId": "def"}, agent_id="AGT03")  # Kafka back up now

    working_producer.send.assert_awaited_once()

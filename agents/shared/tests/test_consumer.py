"""
Tests for agents/shared/events/consumer.py's resilience to Kafka being
unreachable — a real production incident where AGT-10's consumer was
scheduled via a fire-and-forget asyncio.create_task with nothing
supervising it (see agents/agt10_habit/main.py's lifespan). When Kafka
wasn't ready yet at container boot, the single failed connection attempt
permanently and silently killed event consumption for the rest of the
process's life: the FastAPI app itself stayed up and its /health endpoint
kept reporting fine, so nothing else ever noticed.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

import agents.shared.events.consumer as consumer_module


@pytest.fixture(autouse=True)
def fast_retries(monkeypatch):
    """Don't make tests actually wait out the real reconnect delay."""
    monkeypatch.setattr(consumer_module, "_RECONNECT_DELAY_SECONDS", 0)


async def _run_briefly_then_cancel(coro):
    task = asyncio.create_task(coro)
    await asyncio.sleep(0.05)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


async def test_consume_retries_after_a_failed_start(monkeypatch):
    """The actual bug: a failed connect attempt must be retried, not left
    dead forever. Uses an always-failing mock (rather than a finite
    side_effect list) since with _RECONNECT_DELAY_SECONDS patched to 0, the
    retry loop can cycle many times within the test's brief run window."""
    always_failing = AsyncMock()
    always_failing.start.side_effect = Exception("Unable to bootstrap from [('kafka', 9092)]")

    fake_consumer_cls = MagicMock(return_value=always_failing)
    monkeypatch.setattr(consumer_module, "AIOKafkaConsumer", fake_consumer_cls)

    handler = AsyncMock()
    await _run_briefly_then_cancel(consumer_module.consume(["session.end"], "test-group", handler))

    assert fake_consumer_cls.call_count >= 2, "a failed start must be retried, not left dead"


async def test_consume_cleans_up_a_consumer_that_failed_to_start(monkeypatch):
    """A consumer object that never fully started must still be stopped
    (best-effort) before constructing a fresh one on retry, to avoid
    leaking a partially-initialized client on every retry cycle."""
    always_failing = AsyncMock()
    always_failing.start.side_effect = Exception("Unable to bootstrap")

    fake_consumer_cls = MagicMock(return_value=always_failing)
    monkeypatch.setattr(consumer_module, "AIOKafkaConsumer", fake_consumer_cls)

    handler = AsyncMock()
    await _run_briefly_then_cancel(consumer_module.consume(["session.end"], "test-group", handler))

    always_failing.stop.assert_awaited()


async def test_consume_survives_a_failing_stop_after_a_mid_stream_error(monkeypatch):
    """The finally block's consumer.stop() must be defensively wrapped too —
    an unguarded failure there would propagate out of the finally and kill
    the while-True retry loop for good, reintroducing this exact bug class
    through a narrower door (a mid-stream drop instead of a failed initial
    connect)."""
    async def _broken_aiter(self):
        raise ConnectionError("Connection lost mid-stream")
        yield  # pragma: no cover - unreachable, but required to make this an async generator function

    broken_consumer = AsyncMock()
    broken_consumer.__aiter__ = _broken_aiter
    broken_consumer.stop.side_effect = Exception("stop() also failed during cleanup")

    fake_consumer_cls = MagicMock(return_value=broken_consumer)
    monkeypatch.setattr(consumer_module, "AIOKafkaConsumer", fake_consumer_cls)

    handler = AsyncMock()
    await _run_briefly_then_cancel(consumer_module.consume(["session.end"], "test-group", handler))

    # If a failing stop() during cleanup killed the loop, this would be 1
    # forever. A working retry loop reconnects (and hits the same failure)
    # repeatedly until cancelled.
    assert fake_consumer_cls.call_count >= 2, "a failing stop() during cleanup must not kill the retry loop"


async def test_consume_cancellation_stops_the_retry_loop(monkeypatch):
    """CancelledError arriving while consume() is asleep between retries
    must actually stop the loop — it must not be swallowed as just another
    connection failure and retried again, or main.py's shutdown
    (task.cancel()) would never actually stop this task."""
    monkeypatch.setattr(consumer_module, "_RECONNECT_DELAY_SECONDS", 60)

    always_failing = AsyncMock()
    always_failing.start.side_effect = Exception("Unable to bootstrap")
    monkeypatch.setattr(consumer_module, "AIOKafkaConsumer", MagicMock(return_value=always_failing))

    handler = AsyncMock()
    task = asyncio.create_task(consumer_module.consume(["session.end"], "test-group", handler))

    await asyncio.sleep(0.05)  # let it fail once and enter the (long) retry sleep
    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task

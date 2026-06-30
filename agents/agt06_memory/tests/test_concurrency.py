"""
Concurrency tests for object_store.

Verifies that boto3 calls (synchronous, blocking) are correctly offloaded
to a thread-pool executor and do not block the asyncio event loop. If
`run_in_executor` were accidentally replaced with a bare synchronous call,
the event loop would stall and all concurrent sessions would freeze.
"""

import asyncio
import time
from unittest.mock import MagicMock

import pytest

from agents.agt06_memory import object_store


@pytest.fixture
def slow_s3(monkeypatch):
    """
    S3 mock whose put_object blocks for 50 ms (simulates real network I/O).
    The tests assert that this blocking call does NOT stall other coroutines.
    """
    s3 = MagicMock()

    def _slow_put(**kwargs):
        time.sleep(0.05)  # blocking — must run in executor thread, not event loop

    s3.put_object.side_effect = _slow_put
    monkeypatch.setattr(object_store, "_get_s3", lambda: s3)
    from agents.shared.config import settings
    monkeypatch.setattr(settings, "MINIO_ENDPOINT", "http://minio:9000", raising=False)
    return s3


async def test_two_concurrent_put_audio_both_succeed(slow_s3):
    """
    Two simultaneous put_audio calls must both complete and return valid URIs.
    This would deadlock/serialize badly if run_in_executor was replaced with
    a bare sync call (though asyncio.gather would still eventually finish
    sequentially — the real proof of non-blocking is the timing test below).
    """
    results = await asyncio.gather(
        object_store.put_audio("userA", "sessA", "turn1", b"audio-a"),
        object_store.put_audio("userB", "sessB", "turn2", b"audio-b"),
    )
    assert results[0].endswith("userA/sessA/turn1.webm")
    assert results[1].endswith("userB/sessB/turn2.webm")
    assert slow_s3.put_object.call_count == 2


async def test_blocking_s3_call_does_not_starve_event_loop(slow_s3):
    """
    While put_audio is waiting on the blocking boto3 call (50 ms sleep),
    a concurrent zero-sleep coroutine must be able to run and complete
    before put_audio finishes — proving the event loop is not blocked by
    the executor thread.
    """
    completion_order: list[str] = []

    async def sentinel():
        # Yield to the event loop a few times; if the loop were blocked by
        # a synchronous boto3 call inside put_audio, this would not get a
        # chance to run until after put_audio's 50ms sleep completed.
        for _ in range(3):
            await asyncio.sleep(0.001)
        completion_order.append("sentinel")

    async def tracked_put_audio():
        await object_store.put_audio("user1", "sess1", "turn1", b"x")
        completion_order.append("put_audio")

    await asyncio.gather(tracked_put_audio(), sentinel())

    # The sentinel (total ~3ms of sleep) must finish before put_audio's
    # blocking 50ms boto3 call returns control to the gather — this is
    # only possible if the boto3 call truly runs off the event loop thread.
    assert completion_order[0] == "sentinel", (
        f"Expected sentinel to complete before put_audio (order was "
        f"{completion_order}). This means the event loop was blocked by a "
        f"synchronous boto3 call. Ensure put_audio uses loop.run_in_executor()."
    )


async def test_concurrent_put_audio_and_put_writing_sample_both_succeed(slow_s3):
    """
    Mixed concurrent calls across both public API functions must both
    complete correctly, confirming put_writing_sample is also offloaded.
    """
    audio_result, writing_result = await asyncio.gather(
        object_store.put_audio("user1", "sess1", "turn1", b"audio"),
        object_store.put_writing_sample("user1", "sample1", "<p>Hi</p>"),
    )
    assert audio_result.endswith("user1/sess1/turn1.webm")
    assert writing_result.endswith("user1/sample1.html")
    assert slow_s3.put_object.call_count == 2

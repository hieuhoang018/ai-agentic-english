from __future__ import annotations

import asyncio
import pytest
from unittest.mock import AsyncMock, patch

import agents.agt09_recommendation.consumers as consumers
import agents.agt09_recommendation.service as service


async def test_handle_plan_event_invalidates_cache_on_plan_ready(monkeypatch):
    """persistent_weakness replan must invalidate the recommendation cache immediately."""
    invalidate_calls = []

    async def fake_invalidate(clerk_user_id: str) -> None:
        invalidate_calls.append(clerk_user_id)

    monkeypatch.setattr(service, "invalidate_cache", fake_invalidate)

    await consumers.handle_plan_event("agent.plan.events", {
        "planId": "plan-1",
        "clerkUserId": "u1",
        "version": 2,
    })

    assert invalidate_calls == ["u1"]


async def test_handle_plan_event_missing_clerk_user_id_is_noop(monkeypatch):
    """Missing clerkUserId must not raise and must not call invalidate_cache."""
    invalidate_calls = []

    async def fake_invalidate(clerk_user_id: str) -> None:
        invalidate_calls.append(clerk_user_id)

    monkeypatch.setattr(service, "invalidate_cache", fake_invalidate)

    await consumers.handle_plan_event("agent.plan.events", {"planId": "plan-2"})

    assert invalidate_calls == []


async def test_start_consumers_returns_one_cancellable_task(monkeypatch):
    """start_consumers must return exactly one asyncio.Task."""
    async def fake_consume(topics, group_id, handler):
        await asyncio.sleep(3600)

    monkeypatch.setattr(consumers, "consume", fake_consume)

    tasks = await consumers.start_consumers()

    assert len(tasks) == 1
    for task in tasks:
        assert isinstance(task, asyncio.Task)
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


async def test_handle_plan_event_does_not_propagate_invalidate_error(monkeypatch):
    """If invalidate_cache raises, handle_plan_event must swallow the exception silently."""
    async def failing_invalidate(clerk_user_id: str) -> None:
        raise RuntimeError("Redis unavailable")

    monkeypatch.setattr(service, "invalidate_cache", failing_invalidate)

    # Must not raise
    await consumers.handle_plan_event("agent.plan.events", {
        "planId": "plan-x",
        "clerkUserId": "u5",
    })

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock

import agents.agt02_learning_path.consumers as consumers
import agents.agt02_learning_path.service as svc


async def test_handle_pattern_event_persistent_weakness_preserves_daily_minutes(monkeypatch):
    """On persistent_weakness replan, use the existing plan's daily_minutes, not the hardcoded 15."""
    monkeypatch.setattr(svc, "get_today_plan", AsyncMock(
        return_value={"daily_minutes": 45, "activities": [], "plan_id": "old-plan", "clerk_user_id": "u1"}
    ))
    generate_calls = []

    async def fake_generate(clerk_user_id, request):
        generate_calls.append(request)
        return {"plan_id": "new-plan"}

    monkeypatch.setattr(svc, "generate_plan", fake_generate)

    await consumers.handle_pattern_event("agent.pattern.events", {
        "type": "persistent_weakness",
        "clerkUserId": "u1",
        "pattern": {"error_type": "verb_tense"},
    })

    assert len(generate_calls) == 1
    assert generate_calls[0]["daily_minutes"] == 45


async def test_handle_pattern_event_falls_back_to_15_when_no_plan(monkeypatch):
    """When there is no active plan (daily_minutes=0), daily_minutes defaults to 15."""
    monkeypatch.setattr(svc, "get_today_plan", AsyncMock(
        return_value={"daily_minutes": 0, "activities": [], "plan_id": None, "clerk_user_id": "u2"}
    ))
    generate_calls = []

    async def fake_generate(clerk_user_id, request):
        generate_calls.append(request)
        return {"plan_id": "new-plan"}

    monkeypatch.setattr(svc, "generate_plan", fake_generate)

    await consumers.handle_pattern_event("agent.pattern.events", {
        "type": "persistent_weakness",
        "clerkUserId": "u2",
    })

    assert len(generate_calls) == 1
    assert generate_calls[0]["daily_minutes"] == 15


async def test_handle_pattern_event_ignores_non_persistent_weakness(monkeypatch):
    """Events with type != persistent_weakness must be silently ignored."""
    generate_calls = []

    async def fake_generate(clerk_user_id, request):
        generate_calls.append(True)
        return {}

    monkeypatch.setattr(svc, "generate_plan", fake_generate)
    monkeypatch.setattr(svc, "get_today_plan", AsyncMock(return_value={"daily_minutes": 30}))

    await consumers.handle_pattern_event("agent.pattern.events", {
        "type": "behavioral_risk",
        "clerkUserId": "u3",
    })

    assert len(generate_calls) == 0


async def test_handle_pattern_event_missing_clerk_user_id_is_noop(monkeypatch):
    """Missing clerkUserId must not raise and must not call generate_plan."""
    generate_calls = []

    async def fake_generate(*a, **kw):
        generate_calls.append(True)

    monkeypatch.setattr(svc, "generate_plan", fake_generate)

    await consumers.handle_pattern_event("agent.pattern.events", {
        "type": "persistent_weakness",
        # no clerkUserId
    })

    assert len(generate_calls) == 0


async def test_handle_pattern_event_triggers_generate_plan_exactly_once(monkeypatch):
    """persistent_weakness must call generate_plan exactly once per event."""
    monkeypatch.setattr(svc, "get_today_plan", AsyncMock(
        return_value={"daily_minutes": 20, "activities": [], "plan_id": "p1", "clerk_user_id": "u4"}
    ))
    mock_generate = AsyncMock(return_value={"plan_id": "new-plan"})
    monkeypatch.setattr(svc, "generate_plan", mock_generate)

    await consumers.handle_pattern_event("agent.pattern.events", {
        "type": "persistent_weakness",
        "clerkUserId": "u4",
    })

    mock_generate.assert_awaited_once()

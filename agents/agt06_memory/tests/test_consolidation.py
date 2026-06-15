from __future__ import annotations

import asyncio
import uuid

import pytest
import fakeredis.aioredis

from agents.agt06_memory import stm, ltm, consolidation

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def patch_redis(monkeypatch):
    fake = fakeredis.aioredis.FakeRedis()

    async def fake_get_redis():
        return fake

    monkeypatch.setattr(stm, "get_redis", fake_get_redis)
    return fake


async def test_consolidate_session_writes_ltm_and_is_idempotent(monkeypatch):
    emitted = []

    async def fake_emit(topic, payload, agent_id, key=None):
        emitted.append((topic, payload, agent_id))

    monkeypatch.setattr(consolidation, "emit", fake_emit)

    clerk_id = f"test-user-{uuid.uuid4()}"
    session_id = str(uuid.uuid4())
    await ltm.create_profile(clerk_id)

    await stm.append_error(session_id, {
        "error_type": "verb_tense", "skill_domain": "SPEAKING", "severity": 2,
    })
    await stm.append_context_turn(session_id, {"role": "user", "content": "Hello there"})
    await stm.append_vocab(session_id, {"word": "deadline", "context_sentence": "Meet the deadline."})

    first = await consolidation.consolidate_session(session_id, clerk_id, "SPEAKING")
    second = await consolidation.consolidate_session(session_id, clerk_id, "SPEAKING")

    assert first is True
    assert second is False
    assert emitted[0][0] == "agent.consolidation.complete"
    assert emitted[0][1]["sessionId"] == session_id

    sessions = await ltm.get_sessions(clerk_id)
    this_session = next(s for s in sessions if str(s["session_id"]) == session_id)
    assert this_session["end_time"] is not None

    errors = await ltm.get_errors(clerk_id)
    assert any(e["error_type"] == "verb_tense" for e in errors)

    vocab = await ltm.get_vocabulary(clerk_id)
    assert any(v["word"] == "deadline" for v in vocab)

    # let the background embedding task finish before the event loop closes
    await asyncio.sleep(0.1)


async def test_consolidate_session_returns_false_for_unknown_session():
    clerk_id = f"test-user-{uuid.uuid4()}"
    await ltm.create_profile(clerk_id)

    # Session row was never created by AGT-03 and has no STM data, but
    # consolidate_session must still create+close it on first call and
    # report False on a genuinely repeated call.
    session_id = str(uuid.uuid4())
    first = await consolidation.consolidate_session(session_id, clerk_id, "SPEAKING")
    second = await consolidation.consolidate_session(session_id, clerk_id, "SPEAKING")

    assert first is True
    assert second is False
    await asyncio.sleep(0.1)

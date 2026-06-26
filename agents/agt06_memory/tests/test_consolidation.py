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


async def test_consolidate_session_idempotent_second_call_does_not_double_write(monkeypatch):
    """Second consolidation call returns False and does not re-run write steps."""
    emitted = []

    async def fake_emit(topic, payload, agent_id, key=None):
        emitted.append(topic)

    monkeypatch.setattr(consolidation, "emit", fake_emit)

    insert_calls = []
    original_insert_error_events = ltm.insert_error_events

    async def counted_insert_error_events(session_id, errors):
        insert_calls.append("insert_error_events")
        return await original_insert_error_events(session_id, errors)

    monkeypatch.setattr(ltm, "insert_error_events", counted_insert_error_events)

    clerk_id = f"test-user-{uuid.uuid4()}"
    session_id = str(uuid.uuid4())
    await ltm.create_profile(clerk_id)

    await stm.append_error(session_id, {"error_type": "article", "skill_domain": "WRITING", "severity": 1})

    first = await consolidation.consolidate_session(session_id, clerk_id, "WRITING")
    second = await consolidation.consolidate_session(session_id, clerk_id, "WRITING")

    assert first is True
    assert second is False
    assert insert_calls.count("insert_error_events") == 1  # not called twice
    assert len(emitted) == 1  # emit only once
    await asyncio.sleep(0.1)


async def test_consolidate_session_per_item_vocab_failure_does_not_abort(monkeypatch):
    """Per-item vocab upsert failure is swallowed; downstream steps still run."""
    emitted = []

    async def fake_emit(topic, payload, agent_id, key=None):
        emitted.append(topic)

    monkeypatch.setattr(consolidation, "emit", fake_emit)

    call_count = {"upsert_vocab": 0}

    async def failing_upsert_vocab(clerk_user_id, word, context_sentence):
        call_count["upsert_vocab"] += 1
        raise RuntimeError("Simulated vocab DB failure")

    monkeypatch.setattr(ltm, "upsert_vocab", failing_upsert_vocab)

    insert_conversation_calls = []
    original_insert_conversation = ltm.insert_conversation

    async def tracked_insert_conversation(session_id, clerk_user_id, context):
        insert_conversation_calls.append(session_id)
        return await original_insert_conversation(session_id, clerk_user_id, context)

    monkeypatch.setattr(ltm, "insert_conversation", tracked_insert_conversation)

    clerk_id = f"test-user-{uuid.uuid4()}"
    session_id = str(uuid.uuid4())
    await ltm.create_profile(clerk_id)

    await stm.append_vocab(session_id, {"word": "resilient", "context_sentence": "She is resilient."})
    await stm.append_context_turn(session_id, {"role": "user", "content": "I learn English."})

    result = await consolidation.consolidate_session(session_id, clerk_id, "READING")

    assert result is True
    assert call_count["upsert_vocab"] == 1  # was called and failed
    assert session_id in insert_conversation_calls  # downstream step still ran
    assert "agent.consolidation.complete" in emitted  # emit still fired
    await asyncio.sleep(0.1)


async def test_consolidate_session_kafka_emit_failure_propagates(monkeypatch):
    """Kafka emit failure is NOT swallowed — propagates to caller.

    Design note: if emit becomes best-effort in future, this test must be updated.
    """
    async def failing_emit(topic, payload, agent_id, key=None):
        raise RuntimeError("Kafka broker unreachable")

    monkeypatch.setattr(consolidation, "emit", failing_emit)

    clerk_id = f"test-user-{uuid.uuid4()}"
    session_id = str(uuid.uuid4())
    await ltm.create_profile(clerk_id)

    with pytest.raises(RuntimeError, match="Kafka broker unreachable"):
        await consolidation.consolidate_session(session_id, clerk_id, "SPEAKING")
    await asyncio.sleep(0.1)


async def test_consolidate_session_empty_stm_session_succeeds(monkeypatch):
    """Empty STM (no errors, no context, no vocab) still consolidates successfully."""
    emitted = []

    async def fake_emit(topic, payload, agent_id, key=None):
        emitted.append((topic, payload))

    monkeypatch.setattr(consolidation, "emit", fake_emit)

    close_session_calls = []
    original_close_session = ltm.close_session

    async def tracked_close_session(session_id):
        close_session_calls.append(session_id)
        return await original_close_session(session_id)

    monkeypatch.setattr(ltm, "close_session", tracked_close_session)

    clerk_id = f"test-user-{uuid.uuid4()}"
    session_id = str(uuid.uuid4())
    await ltm.create_profile(clerk_id)

    # No STM data written — empty session

    result = await consolidation.consolidate_session(session_id, clerk_id, "LISTENING")

    assert result is True
    assert session_id in close_session_calls
    emitted_topics = [e[0] for e in emitted]
    assert "agent.consolidation.complete" in emitted_topics
    emitted_payload = emitted[0][1]
    assert emitted_payload["sessionId"] == session_id
    await asyncio.sleep(0.1)

from __future__ import annotations

import asyncio
import uuid
from unittest.mock import AsyncMock

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
    """
    Vocab upsert batch failure is swallowed; downstream steps still run.
    (Was per-item isolation before the executemany batching fix — a single
    batch failure now takes the whole vocab batch with it, but consolidation
    as a whole must still proceed and succeed.)
    """
    emitted = []

    async def fake_emit(topic, payload, agent_id, key=None):
        emitted.append(topic)

    monkeypatch.setattr(consolidation, "emit", fake_emit)

    call_count = {"upsert_vocab_batch": 0}

    async def failing_upsert_vocab_batch(clerk_user_id, encounters):
        call_count["upsert_vocab_batch"] += 1
        raise RuntimeError("Simulated vocab DB failure")

    monkeypatch.setattr(ltm, "upsert_vocab_batch", failing_upsert_vocab_batch)

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
    assert call_count["upsert_vocab_batch"] == 1  # was called and failed
    assert session_id in insert_conversation_calls  # downstream step still ran
    assert "agent.consolidation.complete" in emitted  # emit still fired
    await asyncio.sleep(0.1)


async def test_consolidate_session_returns_true_even_when_emit_fails(monkeypatch):
    """If get_producer() raises during the step-7 emit (Kafka bootstrap failure),
    consolidation must still return True — all DB writes (steps 2-6) already succeeded."""
    monkeypatch.setattr("agents.agt06_memory.stm.get_all_session_keys", AsyncMock(
        return_value={"errors": [], "context": [], "vocab": []}
    ))
    monkeypatch.setattr("agents.agt06_memory.ltm.create_session", AsyncMock())
    monkeypatch.setattr("agents.agt06_memory.ltm.close_session", AsyncMock(return_value=True))
    monkeypatch.setattr("agents.agt06_memory.ltm.insert_error_events", AsyncMock())
    monkeypatch.setattr("agents.agt06_memory.ltm.upsert_vocab", AsyncMock())
    monkeypatch.setattr("agents.agt06_memory.ltm.insert_conversation", AsyncMock(return_value="conv-1"))

    async def failing_emit(*args, **kwargs):
        raise RuntimeError("Kafka broker unreachable")

    monkeypatch.setattr("agents.agt06_memory.consolidation.emit", failing_emit)

    result = await consolidation.consolidate_session("sess-kafka-fail", "user-1", "SPEAKING")

    assert result is True, "consolidation must return True even when Kafka emit fails at step 7"


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


async def test_generate_and_store_embedding_swallows_exceptions(monkeypatch):
    monkeypatch.setattr(
        consolidation.embeddings, "embed_transcript",
        AsyncMock(side_effect=RuntimeError("Ollama unreachable")),
    )
    mock_execute = AsyncMock()
    monkeypatch.setattr(consolidation, "execute", mock_execute)
    # Must not raise:
    await consolidation._generate_and_store_embedding("conv-1", [{"role": "user", "content": "Hello"}])
    mock_execute.assert_not_awaited()


async def test_generate_and_store_embedding_skips_empty_context(monkeypatch):
    mock_embed = AsyncMock()
    mock_execute = AsyncMock()
    monkeypatch.setattr(consolidation.embeddings, "embed_transcript", mock_embed)
    monkeypatch.setattr(consolidation, "execute", mock_execute)
    await consolidation._generate_and_store_embedding("conv-2", [])
    mock_embed.assert_not_awaited()
    mock_execute.assert_not_awaited()


async def test_generate_and_store_embedding_updates_db_on_success(monkeypatch):
    mock_embed = AsyncMock(return_value=[0.1, 0.2, 0.3])
    mock_execute = AsyncMock()
    monkeypatch.setattr(consolidation.embeddings, "embed_transcript", mock_embed)
    monkeypatch.setattr(consolidation, "execute", mock_execute)

    await consolidation._generate_and_store_embedding("conv-3", [{"role": "user", "content": "Great session"}])

    mock_embed.assert_awaited_once_with("Great session")
    mock_execute.assert_awaited_once()
    call_args = mock_execute.call_args
    sql = call_args.args[0]
    assert "UPDATE conversation_archive" in sql
    from agents.agt06_memory.ltm import _vec_to_str
    assert call_args.args[1] == _vec_to_str([0.1, 0.2, 0.3])
    assert call_args.args[2] == "conv-3"

from __future__ import annotations

import uuid

import pytest

from agents.agt06_memory import ltm

pytestmark = pytest.mark.integration


async def test_profile_create_and_get():
    clerk_id = f"test-user-{uuid.uuid4()}"

    created = await ltm.create_profile(clerk_id)
    assert created["clerk_user_id"] == clerk_id

    fetched = await ltm.get_profile(clerk_id)
    assert fetched is not None
    assert fetched["clerk_user_id"] == clerk_id


async def test_get_profile_returns_none_for_unknown_user():
    assert await ltm.get_profile(f"no-such-user-{uuid.uuid4()}") is None


async def test_session_create_close_idempotent():
    clerk_id = f"test-user-{uuid.uuid4()}"
    session_id = str(uuid.uuid4())

    await ltm.create_profile(clerk_id)
    await ltm.create_session(session_id, clerk_id, "SPEAKING")

    first_close = await ltm.close_session(session_id)
    second_close = await ltm.close_session(session_id)

    assert first_close is True
    assert second_close is False


async def test_insert_error_events_and_get_errors():
    clerk_id = f"test-user-{uuid.uuid4()}"
    session_id = str(uuid.uuid4())

    await ltm.create_profile(clerk_id)
    await ltm.create_session(session_id, clerk_id, "SPEAKING")
    await ltm.insert_error_events(session_id, [
        {
            "clerk_user_id": clerk_id,
            "error_type": "verb_tense",
            "skill_domain": "SPEAKING",
            "severity": 2,
            "context_excerpt": "I go to work yesterday.",
        },
    ])

    errors = await ltm.get_errors(clerk_id)
    assert any(e["error_type"] == "verb_tense" for e in errors)

    speaking_only = await ltm.get_errors(clerk_id, skill_domain="SPEAKING")
    assert all(e["skill_domain"] == "SPEAKING" for e in speaking_only)


async def test_upsert_vocab_increments_encounter_count():
    clerk_id = f"test-user-{uuid.uuid4()}"
    await ltm.create_profile(clerk_id)

    await ltm.upsert_vocab(clerk_id, "deadline", "Meet the deadline.")
    await ltm.upsert_vocab(clerk_id, "deadline", "Another deadline approaches.")

    vocab = await ltm.get_vocabulary(clerk_id)
    word = next(v for v in vocab if v["word"] == "deadline")
    assert word["encounter_count"] == 2
    assert len(word["context_sentences"]) == 2


async def test_insert_and_get_conversation():
    clerk_id = f"test-user-{uuid.uuid4()}"
    session_id = str(uuid.uuid4())

    await ltm.create_profile(clerk_id)
    await ltm.create_session(session_id, clerk_id, "SPEAKING")

    conv_id = await ltm.insert_conversation(
        session_id, clerk_id, [{"role": "user", "content": "hi"}]
    )
    assert conv_id

    conversations = await ltm.get_conversations(clerk_id)
    assert any(str(c["conv_id"]) == conv_id for c in conversations)

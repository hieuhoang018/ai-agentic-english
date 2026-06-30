from __future__ import annotations

import pytest
import fakeredis.aioredis

from agents.agt06_memory import stm


@pytest.fixture(autouse=True)
def patch_redis(monkeypatch):
    fake = fakeredis.aioredis.FakeRedis()

    async def fake_get_redis():
        return fake

    monkeypatch.setattr(stm, "get_redis", fake_get_redis)
    return fake


async def test_append_and_get_errors():
    await stm.append_error("sess1", {"error_type": "verb_tense", "severity": 2})
    errors = await stm.get_errors("sess1")
    assert errors == [{"error_type": "verb_tense", "severity": 2}]


async def test_get_errors_empty_for_unknown_session():
    assert await stm.get_errors("does-not-exist") == []


async def test_set_and_get_state():
    await stm.set_state("sess1", {"skill_focus": "SPEAKING", "phase": "warm_up"})
    state = await stm.get_state("sess1")
    assert state == {"skill_focus": "SPEAKING", "phase": "warm_up"}


async def test_get_state_returns_none_when_missing():
    assert await stm.get_state("does-not-exist") is None


async def test_append_context_turn_respects_max_turns():
    for i in range(25):
        await stm.append_context_turn("sess1", {"role": "user", "content": f"turn {i}"})

    context = await stm.get_context("sess1")

    assert len(context) == stm.MAX_CONTEXT_TURNS
    assert context[0]["content"] == "turn 5"
    assert context[-1]["content"] == "turn 24"


async def test_vocab_append_and_get():
    await stm.append_vocab("sess1", {"word": "deadline", "context_sentence": "Meet the deadline."})
    vocab = await stm.get_vocab("sess1")
    assert vocab == [{"word": "deadline", "context_sentence": "Meet the deadline."}]


async def test_difficulty_and_lang_roundtrip():
    await stm.set_difficulty("sess1", {"level": "B1"})
    await stm.set_lang("sess1", {"vi_fallback": True})

    assert await stm.get_difficulty("sess1") == {"level": "B1"}
    assert await stm.get_lang("sess1") == {"vi_fallback": True}


async def test_get_all_session_keys_returns_all_categories():
    await stm.set_state("sess1", {"skill_focus": "SPEAKING"})
    await stm.append_error("sess1", {"error_type": "x", "severity": 1})
    await stm.append_context_turn("sess1", {"role": "user", "content": "hi"})
    await stm.append_vocab("sess1", {"word": "deadline", "context_sentence": "Meet it."})

    data = await stm.get_all_session_keys("sess1")

    assert set(data.keys()) == {"state", "errors", "context", "vocab", "difficulty", "lang", "writing"}
    assert data["state"]["skill_focus"] == "SPEAKING"
    assert data["errors"][0]["error_type"] == "x"
    assert data["context"][0]["content"] == "hi"
    assert data["vocab"][0]["word"] == "deadline"
    assert data["difficulty"] is None
    assert data["lang"] is None
    assert data["writing"] is None


async def test_append_error_sets_ttl(patch_redis):
    key = "session:sess1:errors"
    await stm.append_error("sess1", {"type": "grammar", "detail": "test"})
    ttl = await patch_redis.ttl(key)
    assert ttl > 0, f"TTL not set on {key}: got {ttl}"


async def test_append_context_turn_sets_ttl(patch_redis):
    key = "session:sess1:context"
    await stm.append_context_turn("sess1", {"role": "user", "content": "hello"})
    ttl = await patch_redis.ttl(key)
    assert ttl > 0, f"TTL not set on {key}: got {ttl}"


async def test_append_vocab_sets_ttl(patch_redis):
    key = "session:sess1:vocab"
    await stm.append_vocab("sess1", {"word": "finance", "count": 3})
    ttl = await patch_redis.ttl(key)
    assert ttl > 0, f"TTL not set on {key}: got {ttl}"


async def test_set_and_get_session_meta():
    meta = {
        "start_time": "2026-06-30T10:00:00+00:00",
        "clerk_user_id": "user1",
        "skill_focus": "SPEAKING",
        "profile": {"cold_start_flag": True},
        "profile_loaded": True,
    }
    await stm.set_session_meta("sess1", meta)
    result = await stm.get_session_meta("sess1")
    assert result == meta


async def test_get_session_meta_returns_none_when_missing():
    assert await stm.get_session_meta("does-not-exist") is None


async def test_delete_session_meta_removes_it():
    await stm.set_session_meta("sess1", {"clerk_user_id": "u1"})
    await stm.delete_session_meta("sess1")
    assert await stm.get_session_meta("sess1") is None


async def test_delete_session_meta_is_idempotent_when_already_missing():
    # Must not raise when called on a session that was never set or already deleted.
    await stm.delete_session_meta("never-existed")


async def test_incr_turn_count_starts_at_one():
    count = await stm.incr_turn_count("sess1")
    assert count == 1


async def test_incr_turn_count_increments_across_calls():
    await stm.incr_turn_count("sess1")
    await stm.incr_turn_count("sess1")
    count = await stm.incr_turn_count("sess1")
    assert count == 3


async def test_incr_turn_count_is_independent_per_session():
    await stm.incr_turn_count("sess1")
    await stm.incr_turn_count("sess1")
    count_other = await stm.incr_turn_count("sess2")
    assert count_other == 1

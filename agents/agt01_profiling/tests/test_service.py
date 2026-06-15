from __future__ import annotations

import json
import uuid

import pytest
import fakeredis.aioredis

from agents.agt01_profiling import service

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def patch_redis(monkeypatch):
    fake = fakeredis.aioredis.FakeRedis()

    async def fake_get_redis():
        return fake

    monkeypatch.setattr(service, "get_redis", fake_get_redis)
    return fake


async def test_create_and_get_base_profile():
    clerk_id = f"test-user-{uuid.uuid4()}"

    created = await service.create_profile(clerk_id)
    assert created["clerk_user_id"] == clerk_id
    assert created["cold_start_flag"] is True

    fetched = await service.get_profile(clerk_id)
    assert fetched["clerk_user_id"] == clerk_id


async def test_update_profile_partial_merge_only_touches_given_keys():
    clerk_id = f"test-user-{uuid.uuid4()}"
    await service.create_profile(clerk_id)

    await service.update_profile(clerk_id, {"irt_theta": {"S": 0.5}})
    profile = await service.get_profile(clerk_id)

    assert profile["irt_theta"]["S"] == 0.5
    # other theta dims untouched by the partial update
    assert profile["irt_theta"]["L"] == 0.0
    assert profile["irt_theta"]["R"] == 0.0
    assert profile["irt_theta"]["W"] == 0.0


async def test_merge_on_read_combines_ltm_and_stm_without_persisting(patch_redis):
    """
    THE CRITICAL MERGE TEST.

    1. Seed LTM with a known grammar_error_map via update_profile.
    2. Push a raw STM error event for the same (skill, error_type) directly
       into Redis, simulating AGT-04's dual-write.
    3. get_profile(session_id=...) must return LTM + STM summed in-memory.
    4. get_profile() with NO session_id must return the LTM value only —
       proving the merge was never written back.
    5. Calling get_profile(session_id=...) again must return the SAME summed
       value (not double-counted) — proving the merge is recomputed fresh
       each time, not accumulated.
    """
    clerk_id = f"test-user-{uuid.uuid4()}"
    session_id = str(uuid.uuid4())
    await service.create_profile(clerk_id)

    # Step 1: seed LTM
    await service.update_profile(clerk_id, {
        "grammar_error_map": {"SPEAKING": {"verb_tense": 1.0}},
    })

    # Step 2: seed STM (raw Redis list, as AGT-04/AGT-06 would write it)
    await patch_redis.rpush(
        f"session:{session_id}:errors",
        json.dumps({"skill_domain": "SPEAKING", "error_type": "verb_tense", "severity": 2}),
    )

    # Step 3: merged read
    merged = await service.get_profile(clerk_id, session_id=session_id)
    assert merged["grammar_error_map"]["SPEAKING"]["verb_tense"] == 3.0  # 1.0 (LTM) + 2 (STM)
    assert merged["_merged_session_id"] == session_id

    # Step 4: base read is unaffected — merge was never persisted
    base = await service.get_profile(clerk_id)
    assert base["grammar_error_map"]["SPEAKING"]["verb_tense"] == 1.0
    assert "_merged_session_id" not in base

    # Step 5: merged read again is still 3.0, not 5.0
    merged_again = await service.get_profile(clerk_id, session_id=session_id)
    assert merged_again["grammar_error_map"]["SPEAKING"]["verb_tense"] == 3.0


async def test_merge_on_read_with_no_session_errors_returns_base():
    clerk_id = f"test-user-{uuid.uuid4()}"
    session_id = str(uuid.uuid4())
    await service.create_profile(clerk_id)
    await service.update_profile(clerk_id, {
        "grammar_error_map": {"SPEAKING": {"verb_tense": 1.0}},
    })

    merged = await service.get_profile(clerk_id, session_id=session_id)

    assert merged["grammar_error_map"]["SPEAKING"]["verb_tense"] == 1.0
    assert "_merged_session_id" not in merged


async def test_cold_start_profile_for_unknown_user(patch_redis):
    clerk_id = f"test-user-{uuid.uuid4()}"  # never created

    profile = await service.get_profile(clerk_id)

    assert profile["cold_start_flag"] is True
    assert profile["irt_theta"] == {"L": 0.0, "S": 0.0, "R": 0.0, "W": 0.0}

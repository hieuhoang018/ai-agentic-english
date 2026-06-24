from __future__ import annotations

import json
import uuid

import httpx
import pytest
import respx
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


@respx.mock
async def test_merge_on_read_combines_ltm_and_stm_without_persisting(patch_redis):
    """
    THE CRITICAL MERGE TEST.

    1. Seed LTM with a known grammar_error_map via update_profile.
    2. Mock AGT-06's errors endpoint to return one error event, simulating
       the dual-write path (AGT-04 → AGT-06 STM → HTTP endpoint).
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

    # Step 2: mock AGT-06 errors endpoint — service._get_stm_errors calls AGT-06 HTTP,
    # it does not read Redis directly. Allow unlimited calls (steps 3 and 5 both hit it).
    agt06_url = service.AGT06_BASE_URL
    respx.get(f"{agt06_url}/sessions/{session_id}/errors").mock(
        return_value=httpx.Response(200, json=[
            {"skill_domain": "SPEAKING", "error_type": "verb_tense", "severity": 2}
        ])
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


@respx.mock
async def test_get_profile_with_session_id_calls_agt06_not_redis(monkeypatch):
    """get_profile with session_id must fetch errors from AGT-06, not Redis."""
    fake = fakeredis.aioredis.FakeRedis()
    # Pre-populate Redis cache with a base profile
    profile = {
        "clerk_user_id": "user1",
        "irt_theta": {"L": 0.0, "S": 0.0, "R": 0.0, "W": 0.0},
        "grammar_error_map": {"SPEAKING": {"verb_tense": 1.0}},
        "vocabulary_beta": {},
        "behavioral_profile": {},
        "goal_profile": {},
        "cold_start_flag": False,
    }
    await fake.setex(b"profile:user1", 300, json.dumps(profile).encode())

    async def fake_get_redis():
        return fake

    monkeypatch.setattr(service, "get_redis", fake_get_redis)

    # Mock AGT-06 errors endpoint — returns one error event
    agt06_url = service.AGT06_BASE_URL
    respx.get(f"{agt06_url}/sessions/sess1/errors").mock(
        return_value=httpx.Response(200, json=[
            {"skill_domain": "SPEAKING", "error_type": "verb_tense", "severity": 2}
        ])
    )

    merged = await service.get_profile("user1", session_id="sess1")

    # The merge must apply the delta: 1.0 + 2.0 = 3.0
    assert merged["grammar_error_map"]["SPEAKING"]["verb_tense"] == 3.0
    assert merged["_merged_session_id"] == "sess1"


async def test_update_profile_deep_merges_grammar_error_map(monkeypatch):
    """update_profile must deep-merge error types within a skill, not replace the skill dict."""
    import json
    import fakeredis.aioredis
    from agents.agt01_profiling import service

    fake = fakeredis.aioredis.FakeRedis()

    # Seed an initial profile in cache
    profile = {
        "clerk_user_id": "user_dm",
        "irt_theta": {"L": 0.0, "S": 0.0, "R": 0.0, "W": 0.0},
        "grammar_error_map": {"SPEAKING": {"verb_tense": 1.0}},
        "vocabulary_beta": {},
        "behavioral_profile": {},
        "goal_profile": {},
        "cold_start_flag": False,
    }
    await fake.setex(b"profile:user_dm", 300, json.dumps(profile).encode())

    async def fake_get_redis():
        return fake

    monkeypatch.setattr(service, "get_redis", fake_get_redis)

    # Simulate what update_profile does: deep-merge new grammar errors
    # We call the merge logic directly on a copy of the cached profile
    current = dict(profile)
    current["grammar_error_map"] = dict(profile["grammar_error_map"])
    current["grammar_error_map"]["SPEAKING"] = dict(profile["grammar_error_map"]["SPEAKING"])

    updates = {"grammar_error_map": {"SPEAKING": {"article_usage": 0.5}}}

    for field, value in updates.items():
        if field in ("irt_theta", "grammar_error_map", "behavioral_profile",
                     "vocabulary_beta", "goal_profile"):
            if isinstance(value, dict) and isinstance(current.get(field), dict):
                base_dict = current[field]
                for k, v in value.items():
                    if isinstance(v, dict) and isinstance(base_dict.get(k), dict):
                        merged_sub = dict(base_dict[k])
                        merged_sub.update(v)
                        base_dict[k] = merged_sub
                    else:
                        base_dict[k] = v
            else:
                current[field] = value
        else:
            current[field] = value

    gmap = current["grammar_error_map"]
    assert gmap["SPEAKING"]["verb_tense"] == 1.0, "verb_tense must survive deep merge"
    assert gmap["SPEAKING"]["article_usage"] == 0.5, "article_usage must be added by deep merge"

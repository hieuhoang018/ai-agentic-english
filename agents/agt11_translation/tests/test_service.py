import httpx
import pytest
import respx
from agents.agt11_translation import service

AGT01_PROFILE_URL = "http://agt01-profiling:8101/profile/user_test"


# ---------------------------------------------------------------------------
# get_zone_for_user
# ---------------------------------------------------------------------------

@respx.mock
async def test_get_zone_reads_irt_theta_r_from_agt01():
    respx.get(AGT01_PROFILE_URL).mock(
        return_value=httpx.Response(200, json={"irt_theta": {"R": 1.5}})
    )

    zone, theta_r = await service.get_zone_for_user("user_test")

    assert theta_r == 1.5
    assert zone == "en_only"


@respx.mock
async def test_get_zone_defaults_to_bilingual_on_agt01_failure():
    respx.get(AGT01_PROFILE_URL).mock(side_effect=httpx.ConnectError("refused"))

    zone, theta_r = await service.get_zone_for_user("user_test")

    # theta_r=0.0 maps to bilingual zone
    assert theta_r == 0.0
    assert zone == "bilingual"


@respx.mock
async def test_get_zone_defaults_to_bilingual_on_agt01_500():
    respx.get(AGT01_PROFILE_URL).mock(return_value=httpx.Response(500))

    zone, theta_r = await service.get_zone_for_user("user_test")

    assert theta_r == 0.0
    assert zone == "bilingual"


@respx.mock
async def test_get_zone_conversation_session_always_en_only():
    respx.get(AGT01_PROFILE_URL).mock(
        return_value=httpx.Response(200, json={"irt_theta": {"R": -2.0}})
    )

    zone, _ = await service.get_zone_for_user("user_test", session_type="conversation")
    assert zone == "en_only"


# ---------------------------------------------------------------------------
# translate_for_user
# ---------------------------------------------------------------------------

@respx.mock
async def test_translate_for_user_en_only_skips_translation():
    respx.get(AGT01_PROFILE_URL).mock(
        return_value=httpx.Response(200, json={"irt_theta": {"R": 2.0}})
    )

    result = await service.translate_for_user("Hello world", "user_test")

    assert result["zone"] == "en_only"
    assert result["original"] == result["translated"]
    assert result["cached"] is False


@respx.mock
async def test_translate_for_user_mock_mode_returns_stub(monkeypatch):
    respx.get(AGT01_PROFILE_URL).mock(
        return_value=httpx.Response(200, json={"irt_theta": {"R": 0.0}})
    )

    from agents.shared.config import settings
    monkeypatch.setattr(settings, "INFERENCE_MODE", "mock")

    result = await service.translate_for_user("Hello world", "user_test")

    assert result["zone"] == "bilingual"
    assert result["translated"].startswith("[MOCK VI]")
    assert result["original"] == "Hello world"
    assert "zone_label" in result
    assert "theta_r" in result


@respx.mock
async def test_translate_for_user_vi_primary_zone():
    respx.get(AGT01_PROFILE_URL).mock(
        return_value=httpx.Response(200, json={"irt_theta": {"R": -1.0}})
    )

    result = await service.translate_for_user("A grammar rule", "user_test")
    assert result["zone"] == "vi_primary"


# ---------------------------------------------------------------------------
# explain_error
# ---------------------------------------------------------------------------

@respx.mock
async def test_explain_error_passes_through_translate_pipeline(monkeypatch):
    respx.get(AGT01_PROFILE_URL).mock(
        return_value=httpx.Response(200, json={"irt_theta": {"R": 0.0}})
    )

    from agents.shared.config import settings
    monkeypatch.setattr(settings, "INFERENCE_MODE", "mock")

    result = await service.explain_error("verb_tense", "I go there yesterday", "user_test")

    assert result["zone"] == "bilingual"
    assert "verb_tense" in result["original"] or "verb_tense" in result["translated"]
    assert "zone_label" in result


# ── Live translation path (zone-routing) ─────────────────────────────────────

@respx.mock
async def test_translate_for_user_routes_vi_primary_to_translate_with_correct_zone(monkeypatch):
    """
    When theta-R < -0.5 (vi_primary zone), translate_for_user must call
    translate(content, 'vi_primary') -- not 'bilingual' or 'en_only'.
    """
    respx.get(AGT01_PROFILE_URL).mock(
        return_value=httpx.Response(200, json={"irt_theta": {"R": -1.0}})
    )
    translate_calls: list[tuple[str, str]] = []

    async def capturing_translate(content: str, zone: str) -> tuple[str, bool]:
        translate_calls.append((content, zone))
        return f"[VI] {content}", False

    monkeypatch.setattr("agents.agt11_translation.service.translate", capturing_translate)

    result = await service.translate_for_user("A grammar rule", "user_test")

    assert result["zone"] == "vi_primary"
    assert len(translate_calls) == 1, "translate() must be called exactly once"
    assert translate_calls[0] == ("A grammar rule", "vi_primary")


@respx.mock
async def test_translate_for_user_routes_bilingual_to_translate_with_correct_zone(monkeypatch):
    """
    When theta-R is in [-0.5, 1.0] (bilingual zone), translate_for_user must call
    translate(content, 'bilingual').
    """
    respx.get(AGT01_PROFILE_URL).mock(
        return_value=httpx.Response(200, json={"irt_theta": {"R": 0.0}})
    )
    translate_calls: list[tuple[str, str]] = []

    async def capturing_translate(content: str, zone: str) -> tuple[str, bool]:
        translate_calls.append((content, zone))
        return "[VI] bilingual content", False

    monkeypatch.setattr("agents.agt11_translation.service.translate", capturing_translate)

    result = await service.translate_for_user("Meeting vocabulary", "user_test")

    assert result["zone"] == "bilingual"
    assert len(translate_calls) == 1
    assert translate_calls[0] == ("Meeting vocabulary", "bilingual")


async def test_translate_cache_miss_calls_llm_and_caches_result(monkeypatch):
    """
    In live mode: cache miss -> call_llm must be called with the translation prompt,
    and the result must be written to Redis via r.set(..., ex=CACHE_TTL).
    """
    import fakeredis.aioredis
    from agents.agt11_translation import cache as cache_mod

    fake_r = fakeredis.aioredis.FakeRedis()

    async def fake_get_redis():
        return fake_r

    monkeypatch.setattr(cache_mod, "get_redis", fake_get_redis)
    monkeypatch.setattr(cache_mod.settings, "INFERENCE_MODE", "live")

    llm_calls: list = []

    async def fake_call_llm(messages, agent_id):
        llm_calls.append(messages)
        return "Đây là một ví dụ."

    monkeypatch.setattr(cache_mod, "call_llm", fake_call_llm)

    translated, was_cached = await cache_mod.translate("This is an example.", "bilingual")

    assert len(llm_calls) == 1, "call_llm must be called on cache miss"
    assert translated == "Đây là một ví dụ."
    assert was_cached is False

    cache_key = cache_mod._cache_key("This is an example.", "bilingual")
    stored = await fake_r.get(cache_key)
    assert stored is not None
    assert stored.decode("utf-8") == "Đây là một ví dụ."


async def test_translate_cache_hit_skips_llm(monkeypatch):
    """
    In live mode: Redis cache hit -> translate() must return cached value and
    must NOT call call_llm.
    """
    import fakeredis.aioredis
    from agents.agt11_translation import cache as cache_mod

    fake_r = fakeredis.aioredis.FakeRedis()
    cache_key = cache_mod._cache_key("Hello world", "vi_primary")
    await fake_r.set(cache_key, "Xin chào thế giới".encode("utf-8"))

    async def fake_get_redis():
        return fake_r

    monkeypatch.setattr(cache_mod, "get_redis", fake_get_redis)
    monkeypatch.setattr(cache_mod.settings, "INFERENCE_MODE", "live")

    llm_calls: list = []

    async def fake_call_llm(messages, agent_id):
        llm_calls.append(messages)
        return "should not be called"

    monkeypatch.setattr(cache_mod, "call_llm", fake_call_llm)

    translated, was_cached = await cache_mod.translate("Hello world", "vi_primary")

    assert translated == "Xin chào thế giới"
    assert was_cached is True
    assert len(llm_calls) == 0, "call_llm must NOT be called on cache hit"

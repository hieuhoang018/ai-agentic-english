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

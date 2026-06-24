import httpx
import respx
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch
from agents.agt11_translation.main import app

client = TestClient(app)

AGT01_PROFILE_URL = "http://agt01-profiling:8101/profile/user_abc"


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["agent"] == "AGT-11"
    assert data["status"] == "ok"


@respx.mock
def test_translate_endpoint_en_only_user():
    respx.get(AGT01_PROFILE_URL).mock(
        return_value=httpx.Response(200, json={"irt_theta": {"R": 2.0}})
    )

    resp = client.post("/translate", json={
        "content": "Hello world",
        "clerk_user_id": "user_abc",
        "session_type": "exercise",
    })

    assert resp.status_code == 200
    data = resp.json()
    assert data["zone"] == "en_only"
    assert data["original"] == "Hello world"
    assert data["translated"] == "Hello world"


@respx.mock
def test_translate_endpoint_bilingual_user_mock_mode():
    respx.get(AGT01_PROFILE_URL).mock(
        return_value=httpx.Response(200, json={"irt_theta": {"R": 0.0}})
    )

    resp = client.post("/translate", json={
        "content": "Use present perfect for completed actions.",
        "clerk_user_id": "user_abc",
        "session_type": "exercise",
    })

    assert resp.status_code == 200
    data = resp.json()
    assert data["zone"] == "bilingual"
    assert "[MOCK VI]" in data["translated"]


@respx.mock
def test_explain_endpoint():
    respx.get(AGT01_PROFILE_URL).mock(
        return_value=httpx.Response(200, json={"irt_theta": {"R": -1.0}})
    )

    resp = client.post("/explain", json={
        "error_type": "verb_tense",
        "example": "I go there yesterday",
        "clerk_user_id": "user_abc",
        "session_type": "exercise",
    })

    assert resp.status_code == 200
    data = resp.json()
    assert data["zone"] == "vi_primary"
    assert "verb_tense" in data["original"]


@respx.mock
def test_get_zone_endpoint():
    respx.get(AGT01_PROFILE_URL).mock(
        return_value=httpx.Response(200, json={"irt_theta": {"R": 0.5}})
    )

    resp = client.get("/zone/user_abc")

    assert resp.status_code == 200
    data = resp.json()
    assert data["zone"] == "bilingual"
    assert data["theta_r"] == 0.5


@respx.mock
def test_get_zone_endpoint_agt01_failure_returns_bilingual():
    respx.get(AGT01_PROFILE_URL).mock(side_effect=httpx.ConnectError("refused"))

    resp = client.get("/zone/user_abc")

    assert resp.status_code == 200
    data = resp.json()
    assert data["zone"] == "bilingual"
    assert data["theta_r"] == 0.0

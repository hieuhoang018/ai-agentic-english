import pytest
from fastapi import HTTPException

from agents.shared.auth.clerk import extract_user_id, require_matching_user
from agents.shared.testing import auth_header, make_test_bearer_token


def test_extract_user_id_returns_sub():
    header = auth_header("user_abc")["Authorization"]
    assert extract_user_id(header) == "user_abc"


def test_extract_user_id_missing_header_raises_401():
    with pytest.raises(HTTPException) as exc_info:
        extract_user_id(None)
    assert exc_info.value.status_code == 401


def test_extract_user_id_non_bearer_header_raises_401():
    with pytest.raises(HTTPException) as exc_info:
        extract_user_id("Basic abc123")
    assert exc_info.value.status_code == 401


def test_extract_user_id_malformed_token_raises_401():
    with pytest.raises(HTTPException) as exc_info:
        extract_user_id("Bearer not-a-jwt")
    assert exc_info.value.status_code == 401


def test_extract_user_id_missing_sub_claim_raises_401():
    import base64
    import json

    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256"}).encode()).rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(json.dumps({"iss": "clerk"}).encode()).rstrip(b"=").decode()
    token = f"{header}.{payload}.sig"

    with pytest.raises(HTTPException) as exc_info:
        extract_user_id(f"Bearer {token}")
    assert exc_info.value.status_code == 401


async def test_require_matching_user_allows_matching_sub():
    header = auth_header("user_abc")["Authorization"]
    result = await require_matching_user(clerk_user_id="user_abc", authorization=header)
    assert result == "user_abc"


async def test_require_matching_user_rejects_mismatched_sub():
    header = auth_header("user_abc")["Authorization"]
    with pytest.raises(HTTPException) as exc_info:
        await require_matching_user(clerk_user_id="user_other", authorization=header)
    assert exc_info.value.status_code == 403


async def test_require_matching_user_rejects_missing_token():
    with pytest.raises(HTTPException) as exc_info:
        await require_matching_user(clerk_user_id="user_abc", authorization=None)
    assert exc_info.value.status_code == 401


def test_make_test_bearer_token_round_trips_through_extract_user_id():
    token = make_test_bearer_token("user_xyz")
    assert extract_user_id(f"Bearer {token}") == "user_xyz"

"""Test-only helper for building bearer tokens against agents.shared.auth.clerk."""

import base64
import json


def make_test_bearer_token(sub: str) -> str:
    """
    Builds a well-formed but unsigned JWT for tests, matching the shape Kong
    forwards after validating a real Clerk token. Nothing downstream
    verifies the signature (see agents/shared/auth/clerk.py), so the
    signature segment is a placeholder.
    """
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(json.dumps({"sub": sub}).encode()).rstrip(b"=").decode()
    return f"{header}.{payload}.test-signature"


def auth_header(sub: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_test_bearer_token(sub)}"}

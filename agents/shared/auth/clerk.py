"""
Decodes the `sub` claim from a Kong-forwarded Clerk JWT.

Kong validates the token's signature/expiry against the configured JWKS
before proxying the request; agents only need to decode the already-
validated claims, not re-verify them. Mirrors
packages/shared/src/auth/extractUserId.ts on the TS side.
"""

import base64
import json

from fastapi import Header, HTTPException, Path

BEARER_PREFIX = "Bearer "


def _decode_claims(token: str) -> dict:
    try:
        payload_segment = token.split(".")[1]
        padding = "=" * (-len(payload_segment) % 4)
        payload_bytes = base64.urlsafe_b64decode(payload_segment + padding)
        return json.loads(payload_bytes)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Malformed token") from exc


def extract_user_id(authorization: str | None) -> str:
    if not authorization or not authorization.startswith(BEARER_PREFIX):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization[len(BEARER_PREFIX):].strip()
    claims = _decode_claims(token)

    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        raise HTTPException(status_code=401, detail="Token missing sub claim")

    return sub


async def require_matching_user(
    clerk_user_id: str = Path(...),
    authorization: str | None = Header(None),
) -> str:
    """
    FastAPI dependency for `.../{clerk_user_id}` routes: 403s unless the
    JWT's sub claim matches the path param, so one authenticated user can't
    read another user's data by editing the URL (IDOR).
    """
    token_user_id = extract_user_id(authorization)
    if token_user_id != clerk_user_id:
        raise HTTPException(status_code=403, detail="clerk_user_id does not match token")

    return clerk_user_id

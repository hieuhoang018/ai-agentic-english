"""
User Profiling Agent service layer.

The intra-session merge-on-read is the most critical operation in this module.
See Section 17.9 of project_handoff.md for the full specification.

Merge-on-read protocol:
  - WITH session_id: merge base LTM profile with live STM error deltas in-memory
  - WITHOUT session_id: return base LTM profile only
  - NEVER write the merged result back to Redis or DB — merge is in-memory only
  - Total added latency for merge: <30ms
"""

import json
import logging
import os
import httpx
from copy import deepcopy
from agents.shared.db.postgres import fetchrow, execute, get_pool
from agents.shared.db.redis_client import get_redis
from agents.shared.models.learner import LearnerProfile, IrtTheta
from agents.agt01_profiling import irt, vocabulary, behavioral

logger = logging.getLogger(__name__)

PROFILE_CACHE_TTL = 300  # 5 minutes — write-through cache
AGT06_BASE_URL = os.environ.get("AGT06_BASE_URL", "http://agt06-memory:8106")


async def get_profile(clerk_user_id: str, session_id: str | None = None) -> dict:
    """
    Retrieve learner profile.

    Without session_id: return base LTM profile (from Redis cache or PostgreSQL).
    With session_id: return merged profile (base + in-session error deltas from AGT-06).
    The merge is performed in-memory and never written back.
    """
    base = await _get_base_profile(clerk_user_id)

    if not session_id:
        return base

    # Fetch session error deltas from AGT-06 (the sole STM owner)
    raw_errors = await _get_stm_errors(session_id)

    if not raw_errors:
        return base

    merged = deepcopy(base)
    grammar_map = merged.get("grammar_error_map") or {}
    if isinstance(grammar_map, str):
        grammar_map = json.loads(grammar_map)

    for err in raw_errors:
        try:
            skill = err.get("skill_domain", "SPEAKING")
            etype = err.get("error_type", "unknown")
            sev = float(err.get("severity", 1))
            if skill not in grammar_map:
                grammar_map[skill] = {}
            grammar_map[skill][etype] = grammar_map[skill].get(etype, 0.0) + sev
        except Exception as exc:
            logger.warning("Error merging STM error event: %s", exc)

    merged["grammar_error_map"] = grammar_map
    merged["_merged_session_id"] = session_id
    return merged


async def _get_stm_errors(session_id: str) -> list[dict]:
    """Call AGT-06 to get session error events. Best-effort — returns [] on failure."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{AGT06_BASE_URL}/sessions/{session_id}/errors")
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("_get_stm_errors: AGT-06 call failed session=%s err=%s", session_id, exc)
        return []


async def _get_base_profile(clerk_user_id: str) -> dict:
    """Read from Redis cache, falling back to PostgreSQL on cache miss."""
    r = await get_redis()
    cache_key = f"profile:{clerk_user_id}"
    cached = await r.get(cache_key)
    if cached:
        return json.loads(cached)

    # Cache miss: read from PostgreSQL
    row = await fetchrow(
        "SELECT * FROM learner_profiles WHERE clerk_user_id = $1",
        clerk_user_id,
    )
    if not row:
        # New user: return cold-start profile
        return _cold_start_profile(clerk_user_id)

    profile = _row_to_dict(row)
    # Write to cache
    await r.setex(cache_key, PROFILE_CACHE_TTL, json.dumps(profile, default=str))
    return profile


async def create_profile(clerk_user_id: str) -> dict:
    """Create initial cold-start profile. Idempotent — upserts on conflict."""
    row = await fetchrow(
        """
        INSERT INTO learner_profiles (clerk_user_id)
        VALUES ($1)
        ON CONFLICT (clerk_user_id) DO UPDATE SET updated_at = NOW()
        RETURNING *
        """,
        clerk_user_id,
    )
    profile = _row_to_dict(row)
    # Invalidate cache
    r = await get_redis()
    await r.delete(f"profile:{clerk_user_id}")
    return profile


async def update_profile(clerk_user_id: str, updates: dict) -> dict:
    """
    Apply partial updates to a learner profile.
    Wraps SELECT + UPDATE in a transaction with FOR UPDATE to prevent
    lost-update races when two concurrent callers read the same base row.
    Invalidates the Redis cache after writing.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT * FROM learner_profiles WHERE clerk_user_id = $1 FOR UPDATE",
                clerk_user_id,
            )
            if not row:
                # Create profile outside the current transaction to avoid deadlock,
                # then re-enter a fresh transaction with FOR UPDATE.
                pass

        if not row:
            await create_profile(clerk_user_id)

        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT * FROM learner_profiles WHERE clerk_user_id = $1 FOR UPDATE",
                clerk_user_id,
            )
            if not row:
                return None

            current = _row_to_dict(row)

            # Merge updates
            for field, value in updates.items():
                if field in ("irt_theta", "grammar_error_map", "behavioral_profile",
                             "vocabulary_beta", "goal_profile"):
                    if isinstance(value, dict) and isinstance(current.get(field), dict):
                        # Deep merge: for each top-level key, if both sides are dicts, merge them.
                        # This preserves sibling error types within the same skill domain.
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

            await conn.execute(
                """
                UPDATE learner_profiles SET
                    irt_theta = $2::jsonb,
                    vocabulary_beta = $3::jsonb,
                    grammar_error_map = $4::jsonb,
                    behavioral_profile = $5::jsonb,
                    goal_profile = $6::jsonb,
                    cold_start_flag = $7,
                    updated_at = NOW()
                WHERE clerk_user_id = $1
                """,
                clerk_user_id,
                json.dumps(current.get("irt_theta", {})),
                json.dumps(current.get("vocabulary_beta", {})),
                json.dumps(current.get("grammar_error_map", {})),
                json.dumps(current.get("behavioral_profile", {})),
                json.dumps(current.get("goal_profile", {})),
                current.get("cold_start_flag", True),
            )

    # Invalidate cache — next read will re-populate from DB
    r = await get_redis()
    await r.delete(f"profile:{clerk_user_id}")
    return await _get_base_profile(clerk_user_id)


def _cold_start_profile(clerk_user_id: str) -> dict:
    """Return a safe cold-start profile for new users with no data."""
    return {
        "clerk_user_id": clerk_user_id,
        "irt_theta": {"L": 0.0, "S": 0.0, "R": 0.0, "W": 0.0},
        "vocabulary_beta": {},
        "grammar_error_map": {},
        "behavioral_profile": {},
        "goal_profile": {},
        "cold_start_flag": True,
    }


def _row_to_dict(row) -> dict:
    d = dict(row)
    for key in ("irt_theta", "vocabulary_beta", "grammar_error_map",
                "behavioral_profile", "goal_profile"):
        if isinstance(d.get(key), str):
            d[key] = json.loads(d[key])
    return d

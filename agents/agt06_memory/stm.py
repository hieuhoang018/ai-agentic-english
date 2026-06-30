"""
Short-Term Memory (STM) for active learning sessions.
All keys follow the pattern: session:{sessionId}:{category}
TTL: SESSION_TTL seconds after session end (for safe reconnect).

This module is the single source of truth for STM reads/writes.
AGT-04 calls append_error() directly (dual-write pattern).
AGT-03 calls set_state(), append_context_turn(), etc.
AGT-01 calls get_errors() for the intra-session merge-on-read.
"""

import json
from agents.shared.db.redis_client import get_redis

SESSION_TTL = 7200  # 2 hours beyond session end — safe reconnect window
MAX_CONTEXT_TURNS = 20


async def append_error(session_id: str, error: dict) -> None:
    """
    Append an error event to the session error log.
    Called by AGT-04 as half of the dual-write (the other half is Kafka).
    This is the critical write — STM failure must raise.
    """
    r = await get_redis()
    key = f"session:{session_id}:errors"
    async with r.pipeline(transaction=False) as pipe:
        await pipe.rpush(key, json.dumps(error))
        await pipe.expire(key, SESSION_TTL)
        await pipe.execute()


async def get_errors(session_id: str) -> list[dict]:
    """
    Read all error events for a session.
    Used by AGT-01 for the intra-session merge-on-read protocol.
    Returns empty list if no errors yet — never raises on missing key.
    """
    r = await get_redis()
    raw = await r.lrange(f"session:{session_id}:errors", 0, -1)
    return [json.loads(x) for x in raw]


async def set_state(session_id: str, state: dict) -> None:
    r = await get_redis()
    await r.set(f"session:{session_id}:state", json.dumps(state), ex=SESSION_TTL)


async def get_state(session_id: str) -> dict | None:
    r = await get_redis()
    raw = await r.get(f"session:{session_id}:state")
    return json.loads(raw) if raw else None


async def append_context_turn(session_id: str, turn: dict) -> None:
    """
    Circular buffer of last MAX_CONTEXT_TURNS conversation turns.
    Used by AGT-03 to populate LLM context window.
    """
    r = await get_redis()
    key = f"session:{session_id}:context"
    async with r.pipeline(transaction=False) as pipe:
        await pipe.rpush(key, json.dumps(turn))
        await pipe.ltrim(key, -MAX_CONTEXT_TURNS, -1)
        await pipe.expire(key, SESSION_TTL)
        await pipe.execute()


async def get_context(session_id: str) -> list[dict]:
    r = await get_redis()
    raw = await r.lrange(f"session:{session_id}:context", 0, -1)
    return [json.loads(x) for x in raw]


async def set_difficulty(session_id: str, state: dict) -> None:
    r = await get_redis()
    await r.set(f"session:{session_id}:difficulty", json.dumps(state), ex=SESSION_TTL)


async def get_difficulty(session_id: str) -> dict | None:
    r = await get_redis()
    raw = await r.get(f"session:{session_id}:difficulty")
    return json.loads(raw) if raw else None


async def set_lang(session_id: str, state: dict) -> None:
    r = await get_redis()
    await r.set(f"session:{session_id}:lang", json.dumps(state), ex=SESSION_TTL)


async def get_lang(session_id: str) -> dict | None:
    r = await get_redis()
    raw = await r.get(f"session:{session_id}:lang")
    return json.loads(raw) if raw else None


async def append_vocab(session_id: str, encounter: dict) -> None:
    r = await get_redis()
    key = f"session:{session_id}:vocab"
    async with r.pipeline(transaction=False) as pipe:
        await pipe.rpush(key, json.dumps(encounter))
        await pipe.expire(key, SESSION_TTL)
        await pipe.execute()


async def get_vocab(session_id: str) -> list[dict]:
    r = await get_redis()
    raw = await r.lrange(f"session:{session_id}:vocab", 0, -1)
    return [json.loads(x) for x in raw]


async def set_writing(session_id: str, state: dict) -> None:
    r = await get_redis()
    await r.set(f"session:{session_id}:writing", json.dumps(state), ex=SESSION_TTL)


async def get_writing(session_id: str) -> dict | None:
    r = await get_redis()
    raw = await r.get(f"session:{session_id}:writing")
    return json.loads(raw) if raw else None


async def get_all_session_keys(session_id: str) -> dict:
    """
    Read all STM data for a session in one pass.
    Used by consolidation.py at session end.
    """
    return {
        "state": await get_state(session_id),
        "errors": await get_errors(session_id),
        "context": await get_context(session_id),
        "vocab": await get_vocab(session_id),
        "difficulty": await get_difficulty(session_id),
        "lang": await get_lang(session_id),
        "writing": await get_writing(session_id),
    }

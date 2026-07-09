import asyncpg
from agents.shared.config import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            settings.AGENT_DATABASE_URL,
            min_size=2,
            max_size=10,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def fetchrow(query: str, *args) -> asyncpg.Record | None:
    pool = await get_pool()
    return await pool.fetchrow(query, *args)


async def fetch(query: str, *args) -> list[asyncpg.Record]:
    pool = await get_pool()
    return await pool.fetch(query, *args)


async def execute(query: str, *args) -> str:
    pool = await get_pool()
    return await pool.execute(query, *args)


async def executemany(query: str, args_list: list[tuple]) -> None:
    """
    Batch-execute the same query for a list of argument tuples in a single
    round-trip (asyncpg runs this as one implicit transaction over the
    extended query protocol). Use for N+1 write loops where the per-item
    round-trip cost dominates. Note: unlike the per-item loop it replaces,
    this is all-or-nothing — a single bad row aborts the whole batch, so
    callers that relied on per-item failure isolation should catch around
    the whole call instead of around each item.
    """
    pool = await get_pool()
    return await pool.executemany(query, args_list)

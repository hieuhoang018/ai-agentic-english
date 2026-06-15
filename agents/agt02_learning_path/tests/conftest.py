from __future__ import annotations

import pytest

from agents.shared.db import postgres


@pytest.fixture(autouse=True)
async def _reset_pg_pool():
    """
    Close the shared asyncpg pool after each test.

    pytest-asyncio (auto mode) runs each test function in its own event
    loop. asyncpg pools/connections are bound to the loop that created
    them, so a pool created in one test cannot be reused in the next
    (it raises "Event loop is closed" on Windows' Proactor loop).
    Closing the pool here forces get_pool() to lazily create a fresh
    pool bound to the current test's loop.
    """
    yield
    await postgres.close_pool()

"""
Shared outbound httpx.AsyncClient — one pooled/keep-alive client per agent
process instead of a fresh `async with httpx.AsyncClient(...)` per call.

Same lazily-initialized module-level singleton pattern as
agents/shared/db/postgres.py's get_pool()/close_pool() and
agents/shared/db/redis_client.py's get_redis()/close_redis(): each agent's
FastAPI lifespan calls get_http_client() on startup and close_http_client()
on shutdown.

Call sites that previously set a per-call timeout via
`httpx.AsyncClient(timeout=X)` should instead pass `timeout=X` on the
individual `.get(...)`/`.post(...)` call — httpx supports per-request
timeout overrides on a shared client, so behavior is unchanged.
"""

import httpx

_client: httpx.AsyncClient | None = None

# Default timeout for calls that don't override it per-request. Mirrors the
# most common per-call timeout previously used across agent HTTP call sites.
_DEFAULT_TIMEOUT = 5.0


async def get_http_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT)
    return _client


async def close_http_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None

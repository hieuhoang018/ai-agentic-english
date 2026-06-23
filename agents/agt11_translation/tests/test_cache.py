"""
AGT-11 translation cache tests.

Verifies:
  1. First call populates Redis and returns cached=False.
  2. Second identical call hits Redis and returns cached=True.
  3. The cached value contains non-ASCII Vietnamese characters.

Redis is mocked with a real dict to simulate setex/get behaviour without
requiring a live Redis connection.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture
def fake_redis(monkeypatch):
    """Minimal Redis mock that backs get/setex with a plain dict."""
    store: dict[str, bytes] = {}

    redis_mock = MagicMock()
    redis_mock.get = AsyncMock(side_effect=lambda k: store.get(k))
    redis_mock.setex = AsyncMock(side_effect=lambda k, ttl, v: store.update({k: v}))

    monkeypatch.setattr(
        "agents.agt11_translation.cache.get_redis",
        AsyncMock(return_value=redis_mock),
    )
    return store


async def test_first_call_returns_not_cached(fake_redis):
    from agents.agt11_translation.cache import translate

    _text, was_cached = await translate("Subject-verb agreement", "bilingual")
    assert was_cached is False


async def test_second_call_returns_cached(fake_redis):
    from agents.agt11_translation.cache import translate

    await translate("Subject-verb agreement", "bilingual")
    _text, was_cached = await translate("Subject-verb agreement", "bilingual")
    assert was_cached is True


async def test_mock_translation_contains_non_ascii_vietnamese(fake_redis):
    from agents.agt11_translation.cache import translate

    text, _ = await translate("Subject-verb agreement", "bilingual")
    assert any(ord(c) > 127 for c in text), (
        f"Expected Vietnamese Unicode in mock translation, got: {text!r}"
    )


async def test_different_content_misses_cache(fake_redis):
    from agents.agt11_translation.cache import translate

    await translate("content A", "bilingual")
    _text, was_cached = await translate("content B", "bilingual")
    assert was_cached is False


async def test_same_content_different_zone_misses_cache(fake_redis):
    from agents.agt11_translation.cache import translate

    await translate("hello", "bilingual")
    _text, was_cached = await translate("hello", "vi_primary")
    assert was_cached is False

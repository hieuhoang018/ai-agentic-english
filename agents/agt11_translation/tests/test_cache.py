import hashlib
import pytest
from agents.agt11_translation.cache import _cache_key, CACHE_TTL


# ---------------------------------------------------------------------------
# Cache key determinism and format
# ---------------------------------------------------------------------------

def test_cache_key_is_deterministic():
    k1 = _cache_key("Hello world", "bilingual")
    k2 = _cache_key("Hello world", "bilingual")
    assert k1 == k2


def test_cache_key_differs_by_zone():
    k_bi = _cache_key("Hello world", "bilingual")
    k_vi = _cache_key("Hello world", "vi_primary")
    k_en = _cache_key("Hello world", "en_only")
    assert k_bi != k_vi
    assert k_bi != k_en
    assert k_vi != k_en


def test_cache_key_differs_by_content():
    k1 = _cache_key("Hello world", "bilingual")
    k2 = _cache_key("Goodbye world", "bilingual")
    assert k1 != k2


def test_cache_key_format():
    k = _cache_key("test", "bilingual")
    assert k.startswith("trans:")
    hex_part = k[len("trans:"):]
    assert len(hex_part) == 16
    int(hex_part, 16)  # must be valid hex


def test_cache_key_matches_manual_hash():
    content = "Grammar explanation"
    zone = "vi_primary"
    expected_hex = hashlib.sha256(f"{content}:{zone}".encode("utf-8")).hexdigest()[:16]
    assert _cache_key(content, zone) == f"trans:{expected_hex}"


def test_cache_ttl_is_24_hours():
    assert CACHE_TTL == 86400

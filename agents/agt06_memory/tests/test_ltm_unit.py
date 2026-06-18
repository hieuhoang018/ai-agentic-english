from __future__ import annotations

import pytest

from agents.agt06_memory.ltm import _vec_to_str


def test_vec_to_str_no_spaces():
    assert _vec_to_str([0.0, 1.0]) == "[0.0,1.0]"


def test_vec_to_str_single_element():
    assert _vec_to_str([0.5]) == "[0.5]"


def test_vec_to_str_typical_embedding():
    v = [0.1, 0.2, 0.3, 0.4]
    result = _vec_to_str(v)
    assert " " not in result
    assert result.startswith("[")
    assert result.endswith("]")


def test_vec_to_str_empty():
    assert _vec_to_str([]) == "[]"

"""
Tests for AGT-10 exercise_library.get_exercise_library.

All HTTP calls are mocked with respx. No network or Docker required.
"""
import httpx
import pytest
import respx
from agents.agt10_habit.exercise_library import get_exercise_library, AGT02_BASE, AGT07_BASE, AGT09_BASE, LMS_BASE
from agents.shared.config import settings

USER = "user_x"

AGT02_TODAY_URL = f"{AGT02_BASE}/plans/{USER}/today"
AGT07_DUE_URL = f"{AGT07_BASE}/schedule/{USER}/due"
AGT09_RECO_URL = f"{AGT09_BASE}/recommendations/{USER}"
LMS_MODULES_URL = f"{LMS_BASE}/modules"

TODAY_PLAN = [{"lesson_id": "l1", "type": "grammar"}]
DUE_ITEMS = [{"vocab_id": "v1", "word": "ephemeral"}]
RECOMMENDATIONS = [{"id": "m1", "title": "Module A"}]
BROWSE_MODULES = [{"id": "m2", "title": "Module B"}, {"id": "m3", "title": "Module C"}]


@respx.mock
async def test_get_exercise_library_all_tabs_succeed():
    respx.get(AGT02_TODAY_URL).mock(return_value=httpx.Response(200, json=TODAY_PLAN))
    respx.get(AGT07_DUE_URL).mock(return_value=httpx.Response(200, json=DUE_ITEMS))
    respx.get(AGT09_RECO_URL).mock(return_value=httpx.Response(200, json=RECOMMENDATIONS))
    respx.get(LMS_MODULES_URL).mock(return_value=httpx.Response(200, json=BROWSE_MODULES))

    result = await get_exercise_library(USER)

    assert set(result.keys()) == {"todaysPlan", "dueForReview", "recommended", "browse"}
    assert result["todaysPlan"] == TODAY_PLAN
    assert result["dueForReview"] == DUE_ITEMS
    assert result["recommended"] == RECOMMENDATIONS
    assert result["browse"] == BROWSE_MODULES


@respx.mock
async def test_get_exercise_library_one_tab_raises_still_returns_others():
    respx.get(AGT02_TODAY_URL).mock(return_value=httpx.Response(200, json=TODAY_PLAN))
    respx.get(AGT07_DUE_URL).mock(return_value=httpx.Response(200, json=DUE_ITEMS))
    respx.get(AGT09_RECO_URL).mock(side_effect=httpx.ConnectError("refused"))
    respx.get(LMS_MODULES_URL).mock(return_value=httpx.Response(200, json=BROWSE_MODULES))

    result = await get_exercise_library(USER)

    assert result["recommended"] == []
    assert result["todaysPlan"] == TODAY_PLAN
    assert result["dueForReview"] == DUE_ITEMS
    assert result["browse"] == BROWSE_MODULES


@respx.mock
async def test_get_exercise_library_all_tabs_fail_returns_all_empty():
    respx.get(AGT02_TODAY_URL).mock(side_effect=httpx.ConnectError("refused"))
    respx.get(AGT07_DUE_URL).mock(side_effect=httpx.ConnectError("refused"))
    respx.get(AGT09_RECO_URL).mock(side_effect=httpx.ConnectError("refused"))
    respx.get(LMS_MODULES_URL).mock(side_effect=httpx.ConnectError("refused"))

    result = await get_exercise_library(USER)

    assert set(result.keys()) == {"todaysPlan", "dueForReview", "recommended", "browse"}
    assert result["todaysPlan"] == []
    assert result["dueForReview"] == []
    assert result["recommended"] == []
    assert result["browse"] == []


@respx.mock
async def test_get_exercise_library_dict_response_wrapped_in_list():
    """AGT-02 /today returns a single dict (not a list) — safe() must wrap it."""
    single_dict = {"plan_id": "p1", "lessons": []}
    respx.get(AGT02_TODAY_URL).mock(return_value=httpx.Response(200, json=single_dict))
    respx.get(AGT07_DUE_URL).mock(return_value=httpx.Response(200, json=[]))
    respx.get(AGT09_RECO_URL).mock(return_value=httpx.Response(200, json=[]))
    respx.get(LMS_MODULES_URL).mock(return_value=httpx.Response(200, json=[]))

    result = await get_exercise_library(USER)

    assert result["todaysPlan"] == [single_dict]


@respx.mock
async def test_get_exercise_library_calls_correct_urls():
    """Each of the 4 URLs is called exactly once with the correct user ID."""
    route_today = respx.get(AGT02_TODAY_URL).mock(return_value=httpx.Response(200, json=[]))
    route_due = respx.get(AGT07_DUE_URL).mock(return_value=httpx.Response(200, json=[]))
    route_reco = respx.get(AGT09_RECO_URL).mock(return_value=httpx.Response(200, json=[]))
    route_browse = respx.get(LMS_MODULES_URL).mock(return_value=httpx.Response(200, json=[]))

    await get_exercise_library(USER)

    assert route_today.called
    assert route_due.called
    assert route_reco.called
    assert route_browse.called
    assert route_today.call_count == 1
    assert route_due.call_count == 1
    assert route_reco.call_count == 1
    assert route_browse.call_count == 1


@respx.mock
async def test_get_exercise_library_sends_internal_secret_to_agt02_only():
    """AGT-02's /today route requires x-internal-secret (see agt02_learning_path/main.py);
    the other three tabs are not gated and must not carry the header."""
    route_today = respx.get(AGT02_TODAY_URL).mock(return_value=httpx.Response(200, json=[]))
    route_due = respx.get(AGT07_DUE_URL).mock(return_value=httpx.Response(200, json=[]))
    route_reco = respx.get(AGT09_RECO_URL).mock(return_value=httpx.Response(200, json=[]))
    route_browse = respx.get(LMS_MODULES_URL).mock(return_value=httpx.Response(200, json=[]))

    await get_exercise_library(USER)

    assert route_today.calls[0].request.headers["x-internal-secret"] == settings.INTERNAL_SECRET
    assert "x-internal-secret" not in route_due.calls[0].request.headers
    assert "x-internal-secret" not in route_reco.calls[0].request.headers
    assert "x-internal-secret" not in route_browse.calls[0].request.headers

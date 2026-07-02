import pytest
from unittest.mock import AsyncMock


@pytest.fixture
def mock_stm_errors(monkeypatch):
    def _apply(errors):
        monkeypatch.setattr(
            "agents.agt04_feedback.service._stm_get_errors",
            AsyncMock(return_value=errors),
        )
    return _apply


async def test_summary_groups_errors_by_skill_domain(mock_stm_errors):
    mock_stm_errors([
        {"error_type": "grammar", "skill_domain": "SPEAKING", "severity": 1},
        {"error_type": "grammar", "skill_domain": "SPEAKING", "severity": 1},
        {"error_type": "vocabulary", "skill_domain": "WRITING", "severity": 1},
    ])
    from agents.agt04_feedback.service import summarize_session
    result = await summarize_session("sess-1", "user-1")
    assert result["total_errors"] == 3
    assert result["by_skill"]["SPEAKING"]["total_errors"] == 2
    assert result["by_skill"]["SPEAKING"]["error_type_counts"]["grammar"] == 2
    assert result["by_skill"]["WRITING"]["total_errors"] == 1


async def test_summary_no_errors_returns_empty_breakdown(mock_stm_errors):
    mock_stm_errors([])
    from agents.agt04_feedback.service import summarize_session
    result = await summarize_session("sess-1", "user-1")
    assert result["total_errors"] == 0
    assert result["by_skill"] == {}


async def test_summary_includes_session_and_user_ids(mock_stm_errors):
    mock_stm_errors([])
    from agents.agt04_feedback.service import summarize_session
    result = await summarize_session("sess-42", "user-99")
    assert result["session_id"] == "sess-42"
    assert result["clerk_user_id"] == "user-99"


async def test_summary_missing_keys_fall_back_to_unknown(mock_stm_errors):
    mock_stm_errors([{}])
    from agents.agt04_feedback.service import summarize_session
    result = await summarize_session("sess-1", "user-1")
    assert result["by_skill"]["UNKNOWN"]["total_errors"] == 1
    assert result["by_skill"]["UNKNOWN"]["error_type_counts"]["unknown"] == 1


async def test_session_end_endpoint_returns_summary(monkeypatch):
    from httpx import AsyncClient, ASGITransport
    from unittest.mock import AsyncMock as AM
    monkeypatch.setattr("agents.agt04_feedback.main.close_producer", AM())
    monkeypatch.setattr(
        "agents.agt04_feedback.main.summarize_session",
        AM(return_value={"session_id": "sess-1", "clerk_user_id": "user-1",
                          "total_errors": 0, "by_skill": {}}),
    )
    from agents.agt04_feedback.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/feedback/session-end",
            json={"session_id": "sess-1", "clerk_user_id": "user-1"},
        )
    assert response.status_code == 200
    assert response.json()["total_errors"] == 0

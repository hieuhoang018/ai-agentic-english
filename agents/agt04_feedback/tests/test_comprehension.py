import pytest
from unittest.mock import AsyncMock


@pytest.fixture
def mock_exercise(monkeypatch):
    def _apply(exercise):
        monkeypatch.setattr(
            "agents.agt04_feedback.service._fetch_exercise_answer",
            AsyncMock(return_value=exercise),
        )
    return _apply


@pytest.fixture
def mock_record_error(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr("agents.agt04_feedback.service.record_error", mock)
    return mock


async def test_all_correct_scores_1(mock_exercise, mock_record_error):
    mock_exercise({"answerKey": {"answer": "To remind about a holiday closure"}})
    from agents.agt04_feedback.service import score_comprehension
    result = await score_comprehension(
        responses=[{"question": "q1", "answer": "To remind about a holiday closure"}],
        exercise_id="ex-1", session_id="sess-1", clerk_user_id="user-1",
    )
    assert result["scored"] is True
    assert result["score"] == 1.0
    assert result["correct_count"] == 1
    assert mock_record_error.call_count == 0


async def test_case_insensitive_match(mock_exercise, mock_record_error):
    mock_exercise({"answerKey": {"answer": "3 PM"}})
    from agents.agt04_feedback.service import score_comprehension
    result = await score_comprehension(
        responses=[{"question": "q1", "answer": "3 pm"}],
        exercise_id="ex-1", session_id="sess-1", clerk_user_id="user-1",
    )
    assert result["score"] == 1.0


async def test_incorrect_answer_scores_0_and_records_error(mock_exercise, mock_record_error):
    mock_exercise({"answerKey": {"answer": "3 PM"}})
    from agents.agt04_feedback.service import score_comprehension
    result = await score_comprehension(
        responses=[{"question": "q1", "answer": "4 PM"}],
        exercise_id="ex-1", session_id="sess-1", clerk_user_id="user-1",
    )
    assert result["score"] == 0.0
    assert result["responses"][0]["correct"] is False
    assert mock_record_error.call_count == 1


async def test_mixed_responses_partial_score(mock_exercise, mock_record_error):
    mock_exercise({"answerKey": {"answer": "3 PM"}})
    from agents.agt04_feedback.service import score_comprehension
    result = await score_comprehension(
        responses=[
            {"question": "q1", "answer": "3 PM"},
            {"question": "q1", "answer": "wrong"},
        ],
        exercise_id="ex-1", session_id="sess-1", clerk_user_id="user-1",
    )
    assert result["score"] == 0.5
    assert result["correct_count"] == 1
    assert result["total_responses"] == 2


async def test_exercise_unavailable_returns_unscored(mock_exercise, mock_record_error):
    mock_exercise(None)
    from agents.agt04_feedback.service import score_comprehension
    result = await score_comprehension(
        responses=[{"question": "q1", "answer": "anything"}],
        exercise_id="ex-missing", session_id="sess-1", clerk_user_id="user-1",
    )
    assert result["scored"] is False
    assert result["score"] is None
    assert mock_record_error.call_count == 0


async def test_response_missing_answer_key_scores_incorrect(mock_exercise, mock_record_error):
    mock_exercise({"answerKey": {"answer": "3 PM"}})
    from agents.agt04_feedback.service import score_comprehension
    result = await score_comprehension(
        responses=[{"question": "q1"}],
        exercise_id="ex-1", session_id="sess-1", clerk_user_id="user-1",
    )
    assert result["scored"] is True
    assert result["score"] == 0.0
    assert result["responses"][0]["answer"] == ""
    assert result["responses"][0]["correct"] is False
    assert result["correct_count"] == 0
    assert mock_record_error.call_count == 1


async def test_malformed_answer_key_none_degrades_to_empty_string(mock_exercise, mock_record_error):
    mock_exercise({"answerKey": None})
    from agents.agt04_feedback.service import score_comprehension
    result = await score_comprehension(
        responses=[{"question": "q1", "answer": "anything"}],
        exercise_id="ex-1", session_id="sess-1", clerk_user_id="user-1",
    )
    assert result["scored"] is True
    assert result["score"] == 0.0
    assert result["responses"][0]["correct"] is False
    assert result["correct_count"] == 0
    assert mock_record_error.call_count == 1


async def test_missing_answer_key_field_degrades_to_empty_string(mock_exercise, mock_record_error):
    mock_exercise({})
    from agents.agt04_feedback.service import score_comprehension
    result = await score_comprehension(
        responses=[{"question": "q1", "answer": "anything"}],
        exercise_id="ex-1", session_id="sess-1", clerk_user_id="user-1",
    )
    assert result["scored"] is True
    assert result["score"] == 0.0
    assert result["responses"][0]["correct"] is False
    assert result["correct_count"] == 0
    assert mock_record_error.call_count == 1


async def test_empty_responses_list_scores_zero_without_division_error(mock_exercise, mock_record_error):
    mock_exercise({"answerKey": {"answer": "3 PM"}})
    from agents.agt04_feedback.service import score_comprehension
    result = await score_comprehension(
        responses=[],
        exercise_id="ex-1", session_id="sess-1", clerk_user_id="user-1",
    )
    assert result["scored"] is True
    assert result["score"] == 0.0
    assert result["total_responses"] == 0
    assert result["correct_count"] == 0
    assert result["responses"] == []
    assert mock_record_error.call_count == 0


async def test_comprehension_endpoint_returns_score(monkeypatch):
    from httpx import AsyncClient, ASGITransport
    monkeypatch.setattr("agents.agt04_feedback.main.close_producer", AsyncMock())
    monkeypatch.setattr(
        "agents.agt04_feedback.main.score_comprehension",
        AsyncMock(return_value={"session_id": "sess-1", "score": 1.0, "scored": True,
                                 "responses": [], "total_responses": 0, "correct_count": 0}),
    )
    from agents.agt04_feedback.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/feedback/comprehension",
            json={
                "responses": [{"question": "q1", "answer": "a1"}],
                "exercise_id": "ex-1",
                "session_id": "sess-1",
                "clerk_user_id": "user-1",
                "skill_domain": "READING",
            },
        )
    assert response.status_code == 200
    assert response.json()["score"] == 1.0

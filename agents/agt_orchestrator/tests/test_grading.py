from unittest.mock import AsyncMock
import pytest
import respx
import httpx
from httpx import AsyncClient, ASGITransport

from agents.agt_orchestrator.main import app

MCQ_EXERCISE = {
    "id": "ex-1",
    "lessonId": "lesson-1",
    "type": "mcq",
    "prompt": "Which word means 'happy'?",
    "difficulty": "A1",
    "skill": "reading",
    "createdAt": "2026-06-01T00:00:00+00:00",
    "updatedAt": "2026-06-01T00:00:00+00:00",
    "answerKey": {"answer": "B"},
}

FILL_BLANK_EXERCISE = {
    **MCQ_EXERCISE,
    "id": "ex-2",
    "type": "fill-blank",
    "prompt": "I ___ to school every day.",
    "answerKey": {"answer": "go"},
}

SENTENCE_CORRECTION_EXERCISE = {
    **MCQ_EXERCISE,
    "id": "ex-3",
    "type": "sentence-correction",
    "prompt": "She go to market.",
    "answerKey": {"answer": "She goes to the market."},
}

LISTENING_EXERCISE = {
    **MCQ_EXERCISE,
    "id": "ex-4",
    "type": "listening-comprehension",
    "prompt": "What did the speaker say?",
    "answerKey": {"answer": "I am fine"},
}


@pytest.fixture(autouse=True)
def mock_producer_lifecycle(monkeypatch):
    monkeypatch.setattr("agents.agt_orchestrator.main.get_producer", AsyncMock())
    monkeypatch.setattr("agents.agt_orchestrator.main.close_producer", AsyncMock())


@respx.mock
async def test_grading_mcq_correct(monkeypatch):
    mock_emit = AsyncMock()
    monkeypatch.setattr("agents.agt_orchestrator.main.emit", mock_emit)

    respx.get("http://learning-materials-service:4002/internal/exercises/ex-1").mock(
        return_value=httpx.Response(200, json=MCQ_EXERCISE)
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/grading",
            json={"exerciseId": "ex-1", "attemptedAnswer": "B", "userId": "user_test"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["exerciseId"] == "ex-1"
    assert body["correct"] is True
    assert body["score"] == 1.0
    assert body["feedback"] == "Correct!"

    mock_emit.assert_awaited_once_with(
        "attempt.recorded",
        {"exerciseId": "ex-1", "userId": "user_test", "correct": True, "score": 1.0},
        agent_id="ORCH",
        key="user_test",
    )


@respx.mock
async def test_grading_mcq_wrong(monkeypatch):
    monkeypatch.setattr("agents.agt_orchestrator.main.emit", AsyncMock())

    respx.get("http://learning-materials-service:4002/internal/exercises/ex-1").mock(
        return_value=httpx.Response(200, json=MCQ_EXERCISE)
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/grading",
            json={"exerciseId": "ex-1", "attemptedAnswer": "A", "userId": "user_test"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["correct"] is False
    assert body["score"] == 0.0
    assert "B" in body["feedback"]


@respx.mock
async def test_grading_case_insensitive(monkeypatch):
    """Answer 'b' should match key 'B' (case-insensitive)."""
    monkeypatch.setattr("agents.agt_orchestrator.main.emit", AsyncMock())

    respx.get("http://learning-materials-service:4002/internal/exercises/ex-1").mock(
        return_value=httpx.Response(200, json=MCQ_EXERCISE)
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/grading",
            json={"exerciseId": "ex-1", "attemptedAnswer": "b", "userId": "user_test"},
        )

    assert resp.status_code == 200
    assert resp.json()["correct"] is True


@respx.mock
async def test_grading_whitespace_trimming(monkeypatch):
    """Answer ' B ' (with spaces) should match key 'B'."""
    monkeypatch.setattr("agents.agt_orchestrator.main.emit", AsyncMock())

    respx.get("http://learning-materials-service:4002/internal/exercises/ex-1").mock(
        return_value=httpx.Response(200, json=MCQ_EXERCISE)
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/grading",
            json={"exerciseId": "ex-1", "attemptedAnswer": " B ", "userId": "user_test"},
        )

    assert resp.status_code == 200
    assert resp.json()["correct"] is True


@respx.mock
async def test_grading_fill_blank_correct(monkeypatch):
    monkeypatch.setattr("agents.agt_orchestrator.main.emit", AsyncMock())

    respx.get("http://learning-materials-service:4002/internal/exercises/ex-2").mock(
        return_value=httpx.Response(200, json=FILL_BLANK_EXERCISE)
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/grading",
            json={"exerciseId": "ex-2", "attemptedAnswer": "go", "userId": "user_test"},
        )

    assert resp.status_code == 200
    assert resp.json()["correct"] is True


@respx.mock
async def test_grading_sentence_correction_wrong(monkeypatch):
    monkeypatch.setattr("agents.agt_orchestrator.main.emit", AsyncMock())

    respx.get("http://learning-materials-service:4002/internal/exercises/ex-3").mock(
        return_value=httpx.Response(200, json=SENTENCE_CORRECTION_EXERCISE)
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/grading",
            json={"exerciseId": "ex-3", "attemptedAnswer": "She go to market.", "userId": "user_test"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["correct"] is False
    assert "She goes to the market." in body["feedback"]


@respx.mock
async def test_grading_listening_comprehension_correct(monkeypatch):
    monkeypatch.setattr("agents.agt_orchestrator.main.emit", AsyncMock())

    respx.get("http://learning-materials-service:4002/internal/exercises/ex-4").mock(
        return_value=httpx.Response(200, json=LISTENING_EXERCISE)
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/grading",
            json={"exerciseId": "ex-4", "attemptedAnswer": "I am fine", "userId": "user_test"},
        )

    assert resp.status_code == 200
    assert resp.json()["correct"] is True


@respx.mock
async def test_grading_exercise_not_found(monkeypatch):
    monkeypatch.setattr("agents.agt_orchestrator.main.emit", AsyncMock())

    respx.get("http://learning-materials-service:4002/internal/exercises/ex-missing").mock(
        return_value=httpx.Response(404, json={"error": "Not found"})
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/grading",
            json={"exerciseId": "ex-missing", "attemptedAnswer": "B", "userId": "user_test"},
        )

    assert resp.status_code == 404


@respx.mock
async def test_grading_lms_server_error(monkeypatch):
    monkeypatch.setattr("agents.agt_orchestrator.main.emit", AsyncMock())

    respx.get("http://learning-materials-service:4002/internal/exercises/ex-1").mock(
        return_value=httpx.Response(500, json={"error": "Internal server error"})
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/grading",
            json={"exerciseId": "ex-1", "attemptedAnswer": "B", "userId": "user_test"},
        )

    assert resp.status_code == 502


@respx.mock
async def test_grading_kafka_nonfatal(monkeypatch):
    """Kafka emit failure must NOT prevent the 200 response."""
    mock_emit = AsyncMock(side_effect=Exception("Kafka broker down"))
    monkeypatch.setattr("agents.agt_orchestrator.main.emit", mock_emit)

    respx.get("http://learning-materials-service:4002/internal/exercises/ex-1").mock(
        return_value=httpx.Response(200, json=MCQ_EXERCISE)
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/grading",
            json={"exerciseId": "ex-1", "attemptedAnswer": "B", "userId": "user_test"},
        )

    assert resp.status_code == 200
    assert resp.json()["correct"] is True


async def test_grading_missing_field():
    """Missing required field exerciseId must return 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/orchestrate/grading",
            json={"attemptedAnswer": "B", "userId": "user_test"},
        )
    assert resp.status_code == 422

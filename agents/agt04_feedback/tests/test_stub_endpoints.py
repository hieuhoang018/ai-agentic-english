"""HTTP-level tests confirming stub endpoints return 501 Not Implemented."""
import pytest
from unittest.mock import AsyncMock
import httpx
from httpx import AsyncClient, ASGITransport

from agents.agt04_feedback.main import app


@pytest.fixture(autouse=True)
def mock_producer_lifecycle(monkeypatch):
    monkeypatch.setattr("agents.agt04_feedback.main.close_producer", AsyncMock())


async def test_comprehension_endpoint_returns_501():
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
    assert response.status_code == 501


async def test_session_end_endpoint_returns_501():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/feedback/session-end",
            json={
                "session_id": "sess-1",
                "clerk_user_id": "user-1",
            },
        )
    assert response.status_code == 501

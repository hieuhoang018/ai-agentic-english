"""HTTP-level tests for POST /schedule/{clerk_user_id}/rate endpoint."""
import pytest
import httpx
from httpx import ASGITransport
from agents.agt07_review.main import app
import agents.agt07_review.service as service_module


@pytest.fixture
def mock_rate_item_missing(monkeypatch):
    async def fake_fetchrow(query, *args):
        return None
    monkeypatch.setattr("agents.agt07_review.service.fetchrow", fake_fetchrow)
    async def fake_execute(query, *args):
        return "UPDATE 0"
    monkeypatch.setattr("agents.agt07_review.service.execute", fake_execute)


async def test_rate_http_endpoint_returns_404_on_missing_item(mock_rate_item_missing):
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/schedule/user_x/rate",
            json={"item_id": "nonexistent-uuid", "quality": 4},
        )
    assert response.status_code == 404
    assert "detail" in response.json()

"""HTTP-level tests for POST /schedule/{clerk_user_id}/rate endpoint."""
import pytest
import httpx
from httpx import ASGITransport
from agents.agt07_review.main import app
from agents.shared.testing import auth_header
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
            headers=auth_header("user_x"),
        )
    assert response.status_code == 404
    assert "detail" in response.json()


async def test_rate_http_endpoint_returns_403_for_mismatched_user(mock_rate_item_missing):
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/schedule/user_x/rate",
            json={"item_id": "nonexistent-uuid", "quality": 4},
            headers=auth_header("someone-else"),
        )
    assert response.status_code == 403


async def test_due_items_http_endpoint_returns_403_for_mismatched_user(mock_rate_item_missing):
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/schedule/user_x/due",
            headers=auth_header("someone-else"),
        )
    assert response.status_code == 403

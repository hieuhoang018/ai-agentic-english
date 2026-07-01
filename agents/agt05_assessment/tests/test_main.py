from fastapi.testclient import TestClient
from agents.agt05_assessment.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["agent"] == "AGT-05"
    assert data["status"] == "ok"


def test_respond_endpoint_rejects_prior_response_missing_difficulty_param():
    """
    Regression test for the Critical fix: a malformed prior_responses entry
    (missing difficulty_param) must be rejected by Pydantic validation at the
    API boundary with a 422, not crash cat_engine.py with an unguarded
    KeyError (which would surface as a 500).
    """
    resp = client.post(
        "/assessments/respond",
        json={
            "clerk_user_id": "user-001",
            "assessment_id": "test-assessment",
            "item_id": "item-1",
            "correct": True,
            "prior_responses": [{"item_id": "x", "correct": True}],
            "skill_domain": "READING",
        },
    )
    assert resp.status_code == 422


def test_respond_endpoint_accepts_well_formed_prior_responses(monkeypatch):
    """A well-formed request (difficulty_param present on every prior
    response) must pass validation and reach the service layer."""
    async def fake_record_response(assessment_id, item_id, correct, prior_responses, skill_domain, clerk_user_id):
        # Prove the validated Pydantic models were serialized back to plain
        # dicts before reaching record_response (per Fix 1's contract).
        assert isinstance(prior_responses, list)
        assert all(isinstance(r, dict) for r in prior_responses)
        assert prior_responses[0]["difficulty_param"] == -0.5
        return {
            "assessment_id": assessment_id,
            "skill_domain": skill_domain,
            "current_item": {"item_id": "item-2", "difficulty_param": 0.0},
            "items_answered": 2,
            "current_theta": 0.1,
            "terminated": False,
        }

    monkeypatch.setattr(
        "agents.agt05_assessment.main.record_response", fake_record_response
    )

    resp = client.post(
        "/assessments/respond",
        json={
            "clerk_user_id": "user-001",
            "assessment_id": "test-assessment",
            "item_id": "item-1",
            "correct": True,
            "prior_responses": [
                {"item_id": "item-0", "difficulty_param": -0.5, "correct": True}
            ],
            "skill_domain": "READING",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["terminated"] is False

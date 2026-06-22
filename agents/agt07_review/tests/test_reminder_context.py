import httpx
import respx
from fastapi.testclient import TestClient

from agents.agt07_review.main import app
from agents.shared.config import settings

client = TestClient(app)

AGT06_VOCAB_URL = "http://agt06-memory:8106/ltm/user_abc/vocabulary"

VOCAB_RESPONSE = [
    {
        "vocab_id": "vocab-uuid-1",
        "word": "ephemeral",
        "encounter_count": 1,
        "context_sentences": ["The morning mist was ephemeral."],
        "sm_retrievability": 0.5,
        "sm_stability": 1.0,
        "last_encounter": None,
        "alpha": 1.0,
        "beta": 1.0,
    }
]


def test_no_secret_returns_403():
    resp = client.get("/internal/reminders/user_abc/context")
    assert resp.status_code == 403


def test_wrong_secret_returns_403():
    resp = client.get(
        "/internal/reminders/user_abc/context",
        headers={"x-internal-secret": "definitely-wrong"},
    )
    assert resp.status_code == 403


@respx.mock
def test_correct_secret_returns_reminder_context_shape():
    respx.get(AGT06_VOCAB_URL).mock(return_value=httpx.Response(200, json=VOCAB_RESPONSE))

    resp = client.get(
        "/internal/reminders/user_abc/context",
        headers={"x-internal-secret": settings.INTERNAL_SECRET},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["userId"] == "user_abc"
    assert isinstance(data["dueReviewCount"], int)
    assert data["dueReviewCount"] >= 0
    vod = data["vocabOfTheDay"]
    assert vod is not None
    assert vod["vocabItemId"] == "vocab-uuid-1"
    assert vod["term"] == "ephemeral"
    assert vod["meaning"] == ""
    assert vod["exampleSentence"] == "The morning mist was ephemeral."


@respx.mock
def test_empty_vocab_returns_null_vocab_of_the_day():
    respx.get(AGT06_VOCAB_URL).mock(return_value=httpx.Response(200, json=[]))

    resp = client.get(
        "/internal/reminders/user_abc/context",
        headers={"x-internal-secret": settings.INTERNAL_SECRET},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["vocabOfTheDay"] is None


@respx.mock
def test_agt06_failure_returns_zero_count_and_null_vocab():
    respx.get(AGT06_VOCAB_URL).mock(return_value=httpx.Response(500))

    resp = client.get(
        "/internal/reminders/user_abc/context",
        headers={"x-internal-secret": settings.INTERNAL_SECRET},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["dueReviewCount"] == 0
    assert data["vocabOfTheDay"] is None

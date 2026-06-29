from unittest.mock import MagicMock

import pytest

from agents.agt06_memory import object_store


@pytest.fixture
def mock_s3(monkeypatch):
    s3 = MagicMock()
    monkeypatch.setattr(object_store, "_get_s3", lambda: s3)
    from agents.shared.config import settings
    monkeypatch.setattr(settings, "MINIO_ENDPOINT", "http://minio:9000", raising=False)
    return s3


@pytest.mark.asyncio
async def test_put_audio_calls_s3_with_correct_params(mock_s3):
    await object_store.put_audio("user1", "sess1", "turn1", b"audio")
    assert mock_s3.put_object.called
    kwargs = mock_s3.put_object.call_args.kwargs
    assert kwargs["Bucket"] == object_store.BUCKET_AUDIO
    assert kwargs["Key"] == "user1/sess1/turn1.webm"
    assert kwargs["Body"] == b"audio"
    assert kwargs["ContentType"] == "audio/webm"


@pytest.mark.asyncio
async def test_put_audio_returns_correct_uri(mock_s3):
    result = await object_store.put_audio("user1", "sess1", "turn1", b"x")
    assert result == "http://minio:9000/pronunciation-audio/user1/sess1/turn1.webm"


@pytest.mark.asyncio
async def test_put_writing_sample_calls_s3_with_utf8_content(mock_s3):
    await object_store.put_writing_sample("user1", "sample1", "<p>Hello</p>")
    assert mock_s3.put_object.called
    kwargs = mock_s3.put_object.call_args.kwargs
    assert kwargs["Bucket"] == object_store.BUCKET_WRITING
    assert kwargs["Key"] == "user1/sample1.html"
    assert kwargs["Body"] == b"<p>Hello</p>"
    assert kwargs["ContentType"] == "text/html"


@pytest.mark.asyncio
async def test_put_writing_sample_returns_correct_uri(mock_s3):
    result = await object_store.put_writing_sample("user1", "sample1", "content")
    assert result == "http://minio:9000/writing-samples/user1/sample1.html"

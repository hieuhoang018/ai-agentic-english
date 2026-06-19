"""
MinIO object storage for pronunciation audio and writing samples.
Uses boto3 with MinIO endpoint — S3-compatible API.
Switching to AWS S3 or GCP GCS requires only endpoint config change.
"""

import boto3
from botocore.client import Config
from agents.shared.config import settings

_s3 = None


def _get_s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            "s3",
            endpoint_url=settings.MINIO_ENDPOINT,
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",  # required by boto3, ignored by MinIO
        )
    return _s3


BUCKET_AUDIO = "pronunciation-audio"
BUCKET_WRITING = "writing-samples"
BUCKET_EXERCISES = "exercise-audio"


def audio_key(clerk_user_id: str, session_id: str, turn_id: str) -> str:
    """Path: {userId}/{sessionId}/{turnId}.webm"""
    return f"{clerk_user_id}/{session_id}/{turn_id}.webm"


def writing_key(clerk_user_id: str, sample_id: str) -> str:
    """Path: {userId}/{sampleId}.html (annotated draft)"""
    return f"{clerk_user_id}/{sample_id}.html"


def exercise_audio_key(exercise_id: str, speed: str) -> str:
    """Path: {exerciseId}/{speed}.mp3 — speed: 0.75x, 1.0x, 1.25x"""
    return f"{exercise_id}/{speed}.mp3"


async def put_audio(clerk_user_id: str, session_id: str, turn_id: str, audio_bytes: bytes) -> str:
    """
    Store pronunciation audio. Returns the MinIO URI for pronunciation_trends.audio_uri.
    Non-blocking wrapper — boto3 is sync; run in executor for async contexts.
    """
    key = audio_key(clerk_user_id, session_id, turn_id)
    _get_s3().put_object(Bucket=BUCKET_AUDIO, Key=key, Body=audio_bytes, ContentType="audio/webm")
    return f"{settings.MINIO_ENDPOINT}/{BUCKET_AUDIO}/{key}"


async def put_writing_sample(clerk_user_id: str, sample_id: str, html_content: str) -> str:
    key = writing_key(clerk_user_id, sample_id)
    _get_s3().put_object(
        Bucket=BUCKET_WRITING,
        Key=key,
        Body=html_content.encode("utf-8"),
        ContentType="text/html",
    )
    return f"{settings.MINIO_ENDPOINT}/{BUCKET_WRITING}/{key}"


def get_presigned_url(bucket: str, key: str, expires_in: int = 3600) -> str:
    """Generate a pre-signed URL for client-side audio playback."""
    return _get_s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_in,
    )

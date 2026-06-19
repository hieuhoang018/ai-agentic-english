"""
Embedding generation via Ollama nomic-embed-text.
Produces 768-dimensional vectors for pgvector storage.
Always called async after session consolidation — never in the real-time path.
"""

import httpx
import logging
from agents.shared.config import settings

logger = logging.getLogger(__name__)


async def embed_transcript(text: str) -> list[float]:
    """
    Returns a 768-dimensional embedding vector.
    In mock mode: returns a zero vector (correct shape, no API call).
    """
    if settings.INFERENCE_MODE == "mock":
        return [0.0] * 768

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.OLLAMA_BASE_URL}/api/embeddings",
            json={"model": "nomic-embed-text", "prompt": text},
            timeout=30.0,
        )
        resp.raise_for_status()
        data = resp.json()
        vector = data.get("embedding", [])
        if len(vector) != 768:
            logger.warning("Unexpected embedding dimension: %d (expected 768)", len(vector))
        return vector

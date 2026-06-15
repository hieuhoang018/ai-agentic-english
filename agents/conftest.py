from __future__ import annotations

import os

# Ensure tests never accidentally hit live LLM/ASR APIs and always target the
# local docker-compose ports, regardless of the host's .env file.
os.environ.setdefault("INFERENCE_MODE", "mock")
os.environ.setdefault("AGENT_DATABASE_URL", "postgresql://postgres:postgres@localhost:5438/agent_ltm")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("KAFKA_BROKERS", "localhost:9092")

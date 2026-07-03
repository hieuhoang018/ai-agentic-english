from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from agents.shared.security import assert_internal_secret_is_safe


class Settings(BaseSettings):
    # Agent LTM database (postgres-agents, port 5438)
    AGENT_DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5438/agent_ltm"

    # Redis (shared with Node.js services — separate key namespaces)
    REDIS_URL: str = "redis://localhost:6379"

    # Kafka / Redpanda broker
    KAFKA_BROKERS: str = "localhost:9092"

    # MinIO (S3-compatible object storage)
    MINIO_ENDPOINT: str = "http://localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"

    # Groq — Tier 1 LLM + ASR (free, 1,000 LLM RPD, 2,000 ASR RPD)
    GROQ_API_KEY: str = ""
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"

    # OpenRouter — Tier 2 LLM fallback (free, 50 RPD at $0 balance)
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    # Ollama — Tier 3 LLM backstop + embeddings (unlimited, CPU)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MAX_LOADED_MODELS: int = 1

    # LanguageTool — grammar analysis for AGT-04
    # Container-internal URL (container port 8110, no host conflict with AGT-10)
    LANGUAGETOOL_URL: str = "http://languagetool:8010/v2"

    # Inference mode: "mock" uses stub responses, "live" uses real APIs
    # Default is "mock" — all phases work without API keys in mock mode
    INFERENCE_MODE: str = "mock"

    # Shared secret for internal service-to-service calls (e.g. notification-service → AGT-07)
    INTERNAL_SECRET: str = "dev-internal-secret"

    # Cross-agent base URLs (override in Docker via env; defaults target localhost for dev)
    AGT06_BASE_URL: str = "http://localhost:8106"
    LMS_BASE_URL: str = "http://localhost:4002"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def _check_internal_secret(self) -> "Settings":
        assert_internal_secret_is_safe(self.INTERNAL_SECRET, self.INFERENCE_MODE)
        return self


settings = Settings()

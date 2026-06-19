from pydantic import BaseModel
from typing import Any


class AppendErrorRequest(BaseModel):
    error_type: str
    skill_domain: str  # LISTENING | SPEAKING | READING | WRITING
    severity: int      # 1-3
    context_excerpt: str | None = None
    clerk_user_id: str


class SetStateRequest(BaseModel):
    skill_focus: str
    activity: str = ""
    phase: str = "warm_up"
    objective: str = ""
    exercise_format: str = ""


class AppendContextRequest(BaseModel):
    role: str    # "user" | "assistant"
    content: str
    audio_uri: str | None = None


class AppendVocabRequest(BaseModel):
    word: str
    context_sentence: str
    skill_domain: str


class ConsolidateRequest(BaseModel):
    clerk_user_id: str
    skill_focus: str = "SPEAKING"


class ReviewCenterQuery(BaseModel):
    clerk_user_id: str
    query: str | None = None   # natural language semantic search query
    limit: int = 20

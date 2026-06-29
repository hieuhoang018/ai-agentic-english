from __future__ import annotations

from pydantic import BaseModel


class StartSessionRequest(BaseModel):
    clerk_user_id: str
    skill_focus: str = "SPEAKING"
    session_id: str | None = None


class StartSessionResponse(BaseModel):
    session_id: str
    clerk_user_id: str
    skill_focus: str
    opening_message: str
    profile_loaded: bool
    plan_loaded: bool


class TurnRequest(BaseModel):
    session_id: str
    clerk_user_id: str | None = None
    user_message: str | None = None
    audio_base64: str | None = None


class TurnResponse(BaseModel):
    session_id: str
    assistant_message: str
    transcript_text: str | None = None
    mock_feedback: str | None = None
    language: str = "en"
    grammar_feedback: dict | None = None
    translated_message: str | None = None
    translation_zone: str | None = None


class EndSessionRequest(BaseModel):
    session_id: str
    clerk_user_id: str
    skill_focus: str = "SPEAKING"


class EndSessionResponse(BaseModel):
    session_id: str
    consolidated: bool
    duration_minutes: float
    turns_completed: int

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
    cold_start_flag: bool = True


class TurnRequest(BaseModel):
    session_id: str
    user_text: str | None = None
    audio_base64: str | None = None


class TurnResponse(BaseModel):
    session_id: str
    assistant_text: str
    transcript_text: str | None = None


class EndSessionRequest(BaseModel):
    session_id: str
    clerk_user_id: str
    skill_focus: str = "SPEAKING"


class EndSessionResponse(BaseModel):
    session_id: str
    consolidated: bool
    duration_minutes: float

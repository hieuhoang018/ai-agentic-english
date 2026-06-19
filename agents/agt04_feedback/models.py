from pydantic import BaseModel


class SpeakingFeedbackRequest(BaseModel):
    transcript: str
    session_id: str
    clerk_user_id: str
    duration_seconds: float = 0.0
    skill_domain: str = "SPEAKING"


class WritingFeedbackRequest(BaseModel):
    draft: str
    prompt: str
    session_id: str
    clerk_user_id: str


class ComprehensionFeedbackRequest(BaseModel):
    responses: list[dict]
    exercise_id: str
    session_id: str
    clerk_user_id: str
    skill_domain: str = "READING"


class SessionEndRequest(BaseModel):
    session_id: str
    clerk_user_id: str

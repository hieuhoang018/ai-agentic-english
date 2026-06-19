from pydantic import BaseModel


class TranslateRequest(BaseModel):
    content: str
    clerk_user_id: str
    session_type: str = "exercise"  # "conversation" | "exercise" | "assessment" | "review"


class ExplainRequest(BaseModel):
    error_type: str
    example: str
    clerk_user_id: str
    session_type: str = "exercise"

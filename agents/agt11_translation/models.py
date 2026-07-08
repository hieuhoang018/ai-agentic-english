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


class TranslateContentRequest(BaseModel):
    """
    Body shape for the user-facing POST /translate/{clerk_user_id} route —
    unlike TranslateRequest (AGT-03's internal, body-based caller),
    clerk_user_id comes from the JWT-guarded path param here, not the body.
    """
    content: str
    session_type: str = "exercise"

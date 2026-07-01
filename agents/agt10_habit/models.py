from pydantic import BaseModel


class RecordSessionRequest(BaseModel):
    clerk_user_id: str
    current_streak: int = 0
    session_duration_minutes: float = 0.0

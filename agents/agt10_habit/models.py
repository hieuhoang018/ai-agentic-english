from pydantic import BaseModel


class RecordSessionRequest(BaseModel):
    clerk_user_id: str
    current_streak: int = 0
    session_duration_minutes: float = 0.0


class ReEngagementRequest(BaseModel):
    clerk_user_id: str
    days_since_last_session: int
    risk_score: float = 0.0
    streak_days: int = 0
    review_due_count: int = 0

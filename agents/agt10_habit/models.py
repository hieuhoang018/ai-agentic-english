from pydantic import BaseModel


class RecordSessionRequest(BaseModel):
    clerk_user_id: str
    session_id: str

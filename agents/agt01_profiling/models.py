from pydantic import BaseModel
from typing import Any


class CreateProfileRequest(BaseModel):
    clerk_user_id: str
    goal_profile: dict[str, Any] | None = None


class UpdateProfileRequest(BaseModel):
    irt_theta: dict[str, float] | None = None
    grammar_error_map: dict[str, Any] | None = None
    behavioral_profile: dict[str, Any] | None = None
    goal_profile: dict[str, Any] | None = None
    cold_start_flag: bool | None = None

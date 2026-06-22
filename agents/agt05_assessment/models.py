from pydantic import BaseModel


class StartAssessmentRequest(BaseModel):
    clerk_user_id: str
    skill_domain: str  # LISTENING | SPEAKING | READING | WRITING


class RespondRequest(BaseModel):
    clerk_user_id: str
    assessment_id: str
    item_id: str
    correct: bool
    prior_responses: list[dict] = []
    skill_domain: str

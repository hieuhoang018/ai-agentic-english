from pydantic import BaseModel, model_validator


class StartAssessmentRequest(BaseModel):
    clerk_user_id: str
    skill_domain: str  # LISTENING | READING | WRITING only

    @model_validator(mode="after")
    def reject_speaking(self) -> "StartAssessmentRequest":
        if self.skill_domain == "SPEAKING":
            raise ValueError(
                "SPEAKING cannot be assessed via CAT. "
                "Speaking proficiency is built through in-app session performance."
            )
        return self


class RespondRequest(BaseModel):
    clerk_user_id: str
    assessment_id: str
    item_id: str
    correct: bool
    prior_responses: list[dict] = []
    skill_domain: str

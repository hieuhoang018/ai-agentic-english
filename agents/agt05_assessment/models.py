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


class PriorResponse(BaseModel):
    """
    A single previously-answered item, echoed back by the client from an
    earlier `current_item` response. `difficulty_param` is required so the
    EAP engine (cat_engine.py) can compute likelihood/information without
    silently falling back to a neutral default.
    """
    item_id: str
    difficulty_param: float
    correct: bool


class RespondRequest(BaseModel):
    clerk_user_id: str
    assessment_id: str
    item_id: str
    correct: bool
    prior_responses: list[PriorResponse] = []
    skill_domain: str

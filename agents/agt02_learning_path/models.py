from __future__ import annotations

from pydantic import BaseModel, Field


class GeneratePlanRequest(BaseModel):
    skill_estimates: dict[str, float] | None = None
    daily_minutes: int = 15
    goals: list[str] = Field(default_factory=list)


class PlanActivity(BaseModel):
    activity_id: str
    module_id: str | None = None
    skill_domain: str  # LISTENING | SPEAKING | READING | WRITING
    activity_type: str
    title: str
    estimated_minutes: int
    difficulty: str = "B1"
    completed: bool = False


class LearningPlan(BaseModel):
    plan_id: str
    clerk_user_id: str
    lm_plan_id: str
    version: int = 1
    skill_allocation: dict[str, float]
    activities: list[PlanActivity] = Field(default_factory=list)
    path_definition: dict | None = None
    rationale: str = ""
    is_active: bool = True


class TodayPlan(BaseModel):
    clerk_user_id: str
    plan_id: str | None
    activities: list[PlanActivity]
    daily_minutes: int

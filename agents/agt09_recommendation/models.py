from pydantic import BaseModel


class RecommendationItem(BaseModel):
    """A single recommended learning module returned by GET /recommendations/{clerk_user_id}."""

    id: str
    title: str
    skillDomain: str | None = None
    cefrLevel: str | None = None
    rationale: str | None = None
    difficulty: float | None = None
    cold_start: bool = False

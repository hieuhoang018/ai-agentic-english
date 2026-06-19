from __future__ import annotations
from typing import Any
from pydantic import BaseModel, Field
from datetime import datetime


class IrtTheta(BaseModel):
    L: float = 0.0  # Listening ability estimate
    S: float = 0.0  # Speaking ability estimate
    R: float = 0.0  # Reading ability estimate
    W: float = 0.0  # Writing ability estimate


class LearnerProfile(BaseModel):
    """
    The central learner model. Every agent reads this via AGT-01.
    cold_start_flag=True means insufficient data for reliable personalisation.
    All consuming agents must check this flag before making strong decisions.
    """
    clerk_user_id: str
    irt_theta: IrtTheta = Field(default_factory=IrtTheta)
    vocabulary_beta: dict[str, dict[str, float]] = Field(default_factory=dict)
    # grammar_error_map structure: {skillDomain: {errorType: cumulative_severity}}
    grammar_error_map: dict[str, dict[str, float]] = Field(default_factory=dict)
    behavioral_profile: dict[str, Any] = Field(default_factory=dict)
    goal_profile: dict[str, Any] = Field(default_factory=dict)
    cold_start_flag: bool = True
    updated_at: datetime | None = None


class ErrorEvent(BaseModel):
    """
    Emitted by AGT-04 on every error detection.
    Dual-written to Redis STM (session:{id}:errors) AND Kafka agent.errors.
    """
    session_id: str
    clerk_user_id: str
    error_type: str
    skill_domain: str  # LISTENING | SPEAKING | READING | WRITING
    severity: int      # 1=low, 2=medium, 3=high
    context_excerpt: str | None = None
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class SessionState(BaseModel):
    """Current state of an active learning session, stored in Redis STM."""
    session_id: str
    clerk_user_id: str
    skill_focus: str   # LISTENING | SPEAKING | READING | WRITING
    activity: str = ""
    phase: str = "warm_up"  # warm_up | instruction | guided_practice | free_practice | summary
    objective: str = ""
    exercise_format: str = ""


class VocabEncounter(BaseModel):
    """Recorded when a learner encounters a vocabulary item during a session."""
    word: str
    context_sentence: str
    skill_domain: str
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

"""
Tests for AGT-09 recommendation API schemas (models.py).

RecommendationItem contract:
  - id, title are required
  - skillDomain, cefrLevel, rationale, difficulty are optional
  - cold_start defaults to False when absent (warm-path items never set it)
  - internal scorer fields (e.g. "_score") are not part of the public schema
"""

import pytest
from pydantic import ValidationError

from agents.agt09_recommendation.models import RecommendationItem


def test_recommendation_item_requires_id_and_title():
    with pytest.raises(ValidationError):
        RecommendationItem()


def test_recommendation_item_defaults_cold_start_to_false():
    item = RecommendationItem(id="m1", title="Module 1")
    assert item.cold_start is False


def test_recommendation_item_accepts_full_warm_path_shape():
    item = RecommendationItem(
        id="m1", title="Module 1", skillDomain="READING", cefrLevel="B1",
        rationale="Difficulty matches your current READING level.", difficulty=0.4,
    )
    assert item.difficulty == 0.4
    assert item.skillDomain == "READING"


def test_recommendation_item_drops_internal_score_field():
    # scorer.py's scored dicts carry an internal "_score" field used for
    # sorting — it must not leak into the public API schema.
    item = RecommendationItem.model_validate({"id": "m1", "title": "Module 1", "_score": 0.9})
    assert "_score" not in item.model_dump()

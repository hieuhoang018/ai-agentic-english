from __future__ import annotations

from agents.agt02_learning_path.optimizer import (
    MIN_ALLOCATION,
    SKILLS,
    allocate_skills,
    select_daily_activities,
)


def test_allocate_skills_sums_to_one_and_respects_floor():
    profile = {"irt_theta": {"L": 0.0, "S": 0.0, "R": 0.0, "W": 0.0}}

    allocation = allocate_skills(profile)

    assert abs(sum(allocation.values()) - 1.0) < 1e-6
    for skill in SKILLS:
        assert allocation[skill] >= MIN_ALLOCATION - 1e-6


def test_allocate_skills_weights_weaker_skill_higher():
    profile = {"irt_theta": {"L": 2.0, "S": -1.0, "R": 1.0, "W": 1.0}}

    allocation = allocate_skills(profile)

    assert allocation["S"] > allocation["L"]
    assert allocation["S"] > allocation["R"]
    assert allocation["S"] > allocation["W"]


def test_allocate_skills_cold_start_is_balanced():
    profile = {"irt_theta": {}}

    allocation = allocate_skills(profile)

    for skill in SKILLS:
        assert abs(allocation[skill] - 0.25) < 0.02


def test_select_daily_activities_respects_budget_within_tolerance():
    allocation = {"L": 0.25, "S": 0.25, "R": 0.25, "W": 0.25}

    activities = select_daily_activities(allocation, daily_minutes=60)

    total_minutes = sum(a["estimated_minutes"] for a in activities)
    assert 0 < total_minutes <= 60 + 10  # small overshoot tolerance
    # every skill should get at least one activity at 60 minutes / 0.25
    assert {a["skill_domain"] for a in activities} == set(SKILLS)


def test_select_daily_activities_uses_catalog_when_provided():
    allocation = {"L": 1.0, "S": 0.0, "R": 0.0, "W": 0.0}
    catalog = {"L": [{"activity_type": "custom_listen", "title": "Custom Listening", "estimated_minutes": 10}]}

    activities = select_daily_activities(allocation, daily_minutes=10, catalog=catalog)

    assert any(a["activity_type"] == "custom_listen" for a in activities)


def test_select_daily_activities_zero_minutes_returns_empty():
    allocation = {"L": 0.25, "S": 0.25, "R": 0.25, "W": 0.25}

    assert select_daily_activities(allocation, daily_minutes=0) == []


def test_select_daily_activities_always_includes_at_least_one_per_funded_skill():
    # 5 minutes at 100% allocation to S is less than the smallest S activity (5 min)
    allocation = {"L": 0.0, "S": 1.0, "R": 0.0, "W": 0.0}

    activities = select_daily_activities(allocation, daily_minutes=5)

    assert len(activities) >= 1
    assert all(a["skill_domain"] == "S" for a in activities)

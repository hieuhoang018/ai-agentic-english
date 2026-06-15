"""
Multi-objective learning path optimisation.

allocate_skills: weakness-weighted allocation across L/S/R/W.
  Each skill's "gap" = max(TARGET_THETA - theta[skill], 0) + 0.1 (the +0.1
  floor ensures a fully-mastered skill still receives some practice time).
  raw_allocation = gap / sum(gaps), then every skill is floored at
  MIN_ALLOCATION and the result is renormalised so it sums to 1.0.

select_daily_activities: for each skill, converts its allocation share of
  daily_minutes into a target minute budget, then greedily fills that budget
  from a catalog (or FALLBACK_ACTIVITIES when the catalog has nothing for
  that skill). Always includes at least one activity for any skill with a
  non-zero budget, even if that activity alone exceeds the budget slightly.
"""

from __future__ import annotations

TARGET_THETA = 1.0
MIN_ALLOCATION = 0.15
SKILLS = ("L", "S", "R", "W")

FALLBACK_ACTIVITIES: dict[str, list[dict]] = {
    "L": [
        {"activity_type": "listening_clip", "title": "Workplace meeting listening drill", "estimated_minutes": 10},
        {"activity_type": "listening_dictation", "title": "Dictation: voicemail message", "estimated_minutes": 5},
    ],
    "S": [
        {"activity_type": "speaking_roleplay", "title": "Roleplay: client status update call", "estimated_minutes": 10},
        {"activity_type": "speaking_shadowing", "title": "Shadowing: presentation opener", "estimated_minutes": 5},
    ],
    "R": [
        {"activity_type": "reading_passage", "title": "Read: project status email", "estimated_minutes": 10},
        {"activity_type": "reading_vocab", "title": "Vocabulary in context: business idioms", "estimated_minutes": 5},
    ],
    "W": [
        {"activity_type": "writing_email", "title": "Write a follow-up email", "estimated_minutes": 10},
        {"activity_type": "writing_summary", "title": "Summarise a meeting in 3 sentences", "estimated_minutes": 5},
    ],
}


def allocate_skills(profile: dict) -> dict[str, float]:
    """
    Weakness-weighted allocation across the four skills.
    profile["irt_theta"] is expected to have keys L, S, R, W (floats);
    missing keys default to 0.0 (cold-start).
    Result always sums to 1.0 (within float rounding) and every skill
    receives at least MIN_ALLOCATION.
    """
    theta = profile.get("irt_theta") or {}
    gaps = {
        skill: max(TARGET_THETA - float(theta.get(skill, 0.0)), 0.0) + 0.1
        for skill in SKILLS
    }
    total_gap = sum(gaps.values())
    raw = {skill: gaps[skill] / total_gap for skill in SKILLS}

    floored = {skill: max(raw[skill], MIN_ALLOCATION) for skill in SKILLS}
    total_floored = sum(floored.values())
    allocation = {skill: round(floored[skill] / total_floored, 4) for skill in SKILLS}

    # Fix rounding drift so the allocation sums to exactly 1.0
    drift = round(1.0 - sum(allocation.values()), 4)
    if drift != 0.0:
        max_skill = max(allocation, key=allocation.get)
        allocation[max_skill] = round(allocation[max_skill] + drift, 4)

    return allocation


def select_daily_activities(
    allocation: dict[str, float],
    daily_minutes: int,
    catalog: dict[str, list[dict]] | None = None,
) -> list[dict]:
    """
    Fill each skill's share of daily_minutes with activities.
    Returns a list of activity dicts (without activity_id — the caller
    assigns IDs). Skills with a zero-minute budget are skipped entirely.
    """
    catalog = catalog or {}
    activities: list[dict] = []

    for skill in SKILLS:
        skill_minutes = round(daily_minutes * allocation.get(skill, 0.0))
        if skill_minutes <= 0:
            continue

        pool = catalog.get(skill) or FALLBACK_ACTIVITIES[skill]
        remaining = skill_minutes
        added_for_skill = 0
        pool_idx = 0

        while remaining > 0 and pool_idx < len(pool) * 2:
            item = pool[pool_idx % len(pool)]
            est = item.get("estimated_minutes", 5)
            if est <= remaining or added_for_skill == 0:
                activities.append({
                    "skill_domain": skill,
                    "activity_type": item["activity_type"],
                    "title": item["title"],
                    "estimated_minutes": est,
                    "difficulty": item.get("difficulty", "B1"),
                })
                remaining -= est
                added_for_skill += 1
            pool_idx += 1

    return activities

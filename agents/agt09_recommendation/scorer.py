"""
Multi-factor recommendation scoring pipeline.

STUB — equal weights, returns top items by difficulty proximity.
TODO Phase 8+: implement full composite scoring.

Full scoring formula:
  score = weakness_alignment * content_quality * difficulty_match * novelty * skill_diversity_bonus

  weakness_alignment: how well content targets known weak areas (0.0-1.0)
  content_quality:    static content rating from catalog (0.0-1.0)
  difficulty_match:   1 - |item_difficulty - theta| / 2.0 (ZPD proximity)
  novelty:            1.0 if not seen in last 14 days, 0.0 if seen
  skill_diversity_bonus: 1.2 if skill not practised in last 72h, 1.0 otherwise

Filtering rules:
  - Remove items seen in last 14 days
  - Ensure at least 1 of top 3 per skill domain
"""


def score_items(
    candidates: list[dict],
    profile: dict,
    recently_seen_ids: list[str],
) -> list[dict]:
    """
    Stub: score candidates by difficulty proximity to current theta.
    Returns top 3 per skill domain with placeholder rationale.
    TODO Phase 8+: implement full composite formula.
    """
    theta = profile.get("irt_theta", {})
    seen_set = set(recently_seen_ids)

    filtered = [c for c in candidates if c.get("id") not in seen_set]

    scored = []
    for item in filtered:
        skill = item.get("skillDomain", "READING")
        t = theta.get(skill[0], 0.0) if skill else 0.0
        diff = item.get("difficulty", 0.5)
        score = 1.0 - abs(diff - ((t + 2.0) / 4.0))  # normalise theta to [0,1]
        scored.append({
            **item,
            "_score": round(score, 4),
            "rationale": f"Difficulty matches your current {skill} level.",
        })

    scored.sort(key=lambda x: -x["_score"])

    # Top 3 overall (stub — Phase 8+: top 3 per skill with diversity enforcement)
    return scored[:3]

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
    Filters recently-seen items, then selects the top 3 with at least one
    item per skill domain represented when possible.
    TODO Phase 8+: implement full composite formula (weakness_alignment,
    content_quality, skill_diversity_bonus multiplier).
    """
    theta = profile.get("irt_theta", {})
    seen_set = set(recently_seen_ids)

    filtered = [c for c in candidates if c.get("id") not in seen_set]

    scored = []
    for item in filtered:
        skill = item.get("skillDomain", "READING")
        t = theta.get(skill[0]) if skill else None
        if t is None:
            t = 0.0
        diff = item.get("difficulty", 0.5)
        score = 1.0 - abs(diff - ((t + 2.0) / 4.0))  # normalise theta to [0,1]
        scored.append({
            **item,
            "_score": round(score, 4),
            "rationale": f"Difficulty matches your current {skill} level.",
        })

    scored.sort(key=lambda x: -x["_score"])

    return _select_top_with_diversity(scored)


def _select_top_with_diversity(scored: list[dict], top_n: int = 3) -> list[dict]:
    """
    Select top_n items from a score-descending list, guaranteeing at least one
    item per distinct skill domain before filling remaining slots by score.
    """
    selected: list[dict] = []
    seen_domains: set[str] = set()

    for item in scored:
        if len(selected) >= top_n:
            break
        domain = item.get("skillDomain", "READING")
        if domain not in seen_domains:
            selected.append(item)
            seen_domains.add(domain)

    if len(selected) < top_n:
        chosen_ids = {id(item) for item in selected}
        for item in scored:
            if len(selected) >= top_n:
                break
            if id(item) not in chosen_ids:
                selected.append(item)

    selected.sort(key=lambda x: -x["_score"])
    return selected

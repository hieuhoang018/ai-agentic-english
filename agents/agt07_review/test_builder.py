"""
Personalised review test composition.

STUB — equal mix from error history.
TODO Phase 8+: implement 40/30/20/10 composition:
  40% high-decay vocabulary (lowest retrievability R)
  30% persistent grammar error categories (highest error frequency)
  20% pronunciation targets (lowest phoneme accuracy)
  10% comprehension strategy deficits

Exercise format mirrors original error context:
  grammar error in WRITING -> writing-correction format
  grammar error in SPEAKING -> fill-in-the-blank prompt
"""


def compose_test_stub(
    vocab_items: list[dict],
    error_events: list[dict],
    test_size: int = 10,
) -> list[dict]:
    """
    Stub test composition: equal split between vocab and grammar errors.
    Returns a list of review items with type and content.
    TODO Phase 8+: implement 40/30/20/10 composition with format mirroring.
    """
    items = []

    # Half from vocab
    vocab_count = test_size // 2
    for v in vocab_items[:vocab_count]:
        items.append({
            "type": "vocabulary",
            "word": v.get("word"),
            "context": v.get("context_sentences", [""])[0] if v.get("context_sentences") else "",
        })

    # Half from error events
    grammar_count = test_size - vocab_count
    seen_types = set()
    for e in error_events:
        etype = e.get("error_type")
        if etype and etype not in seen_types:
            items.append({
                "type": "grammar",
                "error_type": etype,
                "skill_domain": e.get("skill_domain"),
                "context": e.get("context_excerpt", ""),
            })
            seen_types.add(etype)
        if len(items) >= test_size:
            break

    return items

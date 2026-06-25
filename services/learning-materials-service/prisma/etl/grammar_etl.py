#!/usr/bin/env python3
"""
Grammar-primitives ETL for the learning-materials primitive layer.

Source: CEFR-J Grammar Profile v20180315 (openlanguageprofiles/olp-en-cefrj),
same repo and license as the vocab spine's CEFR-J source. Free for research
and commercial use with citation (Tono Laboratory, Tokyo University of
Foreign Studies).

The source CSV catalogs ~500 grammar items, each tagged with a CEFR-J Level
and/or one of three other frameworks' levels (Core Inventory, EGP, GSELO),
plus a Sentence Type (AFF./NEG. DEC./INT., etc.) for the ~365 rows that are
concrete instantiated forms (e.g. "I am not" / NEG. DEC.). The other ~135
rows are abstract construct names (e.g. "TENSE/ASPECT: PRESENT PERFECT",
"PASSIVE: PAST") with no Sentence Type and no example text in the source —
these are still real, important grammar points (tenses, passive voice,
conditionals, relative clauses), just named rather than exemplified, so they
are kept. Only a short hand-reviewed blocklist of genuinely content-free
umbrella terms (e.g. bare "PREPOSITIONS", or two literal data anomalies with
a dangling colon and no specifier) is dropped.

Output: grammar_seed.jsonl (one JSON object per GrammarPoint, with nested
examples). The loader (prisma/seedGrammar.ts) upserts by (title, cefrLevel),
so source rows sharing both naturally collapse into one GrammarPoint with
multiple examples (one per Sentence Type variant).

Offline-only: run manually, source CSV alongside this script. Not part of
any npm script or CI step. Re-run and copy the output to
../seed-data/grammar_seed.jsonl when source data changes.
"""
import csv, json, re

SRC = "cefrj-grammar.csv"
OUT = "grammar_seed.jsonl"

SOURCE = "CEFR-J Grammar Profile v20180315 (openlanguageprofiles/olp-en-cefrj)"
LICENSE = (
    "CEFR-J Grammar Profile: free for research and commercial use with citation "
    "(Tono Laboratory, Tokyo University of Foreign Studies)"
)

# Hand-reviewed: rows whose Grammatical Item is a pure category umbrella with
# no specific word/construct given anywhere (not even in a sibling row), or a
# literal data anomaly (dangling colon, nothing after it). Everything else
# that reads as ALL-CAPS (e.g. "TENSE/ASPECT: PRESENT PERFECT") is a real,
# specific construct name and is kept.
EXCLUDE_IDS = {
    "13", "14", "21", "22", "23", "24", "42", "55", "56", "57", "150", "174", "183",
}

# Shorthand Code prefix (before the first '.') -> human-readable category.
PREFIX_CATEGORY = {
    "PP": "pronoun", "PGEN": "pronoun", "PPO": "pronoun", "PPOS": "pronoun",
    "PREFL": "pronoun", "PIND": "pronoun", "PREF": "pronoun", "P": "pronoun",
    "PREL": "relative pronoun", "PRELO": "relative pronoun", "PRELGEN": "relative pronoun",
    "DT": "determiner", "QUANT": "quantifier",
    "IN": "preposition", "PREP": "preposition",
    "NN": "noun",
    "RB": "adverb", "RBDEG": "adverb", "RBREL": "relative adverb",
    "COMP": "comparison",
    "V": "verb", "PHV": "verb",
    "TA": "tense-aspect", "PASS": "passive voice",
    "TO": "infinitive", "VG": "gerund", "VN": "participle",
    "IMP": "imperative", "MD": "modal",
    "EX": "existential", "CC": "conjunction",
    "CL": "clause", "CL_after": "clause",
    "WH": "wh-word", "EXCL": "exclamation", "TAG": "tag question",
    "VP": "sentence pattern", "INDSP": "reported speech", "INDQ": "reported speech",
    "EMP": "cleft sentence", "CAUS": "causative", "PERC": "perception verb",
    "SUBJ": "conditional", "INV": "inversion", "INT": "question", "INTF": "question",
}

CEFR_RE = re.compile(r"[ABC][12]")


def is_construct_label(item):
    """True for abstract category names like 'PASSIVE: PRESENT' that have no
    lowercase content outside parens — not a real instantiated phrase, so it
    can't double as an example sentence."""
    stripped = re.sub(r"\([^)]*\)", "", item)
    return not re.search(r"[a-z]", stripped)


def resolve_level(row):
    for col in ("CEFR-J Level", "Core Inventory", "EGP", "GSELO"):
        val = row.get(col, "")
        m = CEFR_RE.search(val)
        if m:
            return m.group(0)
    return None


def humanize_sentence_type(raw):
    raw = raw.strip()
    if not raw or CEFR_RE.fullmatch(raw):  # a couple of rows have garbage CEFR-like values here
        return None
    prefix = ""
    if "(SUBORDINATE CLAUSE)" in raw:
        prefix = "subordinate clause, "
    elif "(MAIN CLAUSE)" in raw:
        prefix = "main clause, "
    elif "(PRECEDING SENTENCE)" in raw:
        prefix = "preceding sentence, "
    labels = []
    for part in raw.split("/"):
        words = []
        if "NEG" in part:
            words.append("negative")
        elif "AFF" in part:
            words.append("affirmative")
        if "DEC" in part:
            words.append("declarative")
        elif "INT" in part:
            words.append("interrogative")
        elif "IMP" in part:
            words.append("imperative")
        elif "EXCLAMATION" in part:
            words.append("exclamatory")
        if words:
            labels.append(" ".join(words))
    if not labels:
        return None
    return prefix + " / ".join(labels)


def explanation_for(item, category, sentence_note):
    if sentence_note:
        return f"{sentence_note.capitalize()} form: \"{item}\""
    return f"{category.capitalize()} construction: \"{item}\""


def main():
    with open(SRC, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    points = {}  # (title, level) -> point dict, preserves first-seen order
    stats = {"rows_seen": 0, "rows_excluded": 0, "rows_no_level": 0, "points": 0, "examples": 0}

    for row in rows:
        stats["rows_seen"] += 1
        base_id = row["ID"].strip()
        item = row["Grammatical Item"].strip()
        if not item or base_id in EXCLUDE_IDS:
            stats["rows_excluded"] += 1
            continue

        level = resolve_level(row)
        if not level:
            stats["rows_no_level"] += 1
            continue

        code = row["Shorthand Code"].strip()
        prefix = code.split(".")[0] if code else ""
        category = PREFIX_CATEGORY.get(prefix, "grammar")

        key = (item, level)
        point = points.get(key)
        if point is None:
            sentence_note = humanize_sentence_type(row["Sentence Type"])
            point = {
                "title": item,
                "category": category,
                "cefr_level": level,
                "explanation": explanation_for(item, category, sentence_note),
                "source": SOURCE,
                "license": LICENSE,
                "examples": [],
            }
            points[key] = point
            stats["points"] += 1

        sentence_note = humanize_sentence_type(row["Sentence Type"])
        if sentence_note and not is_construct_label(item):
            point["examples"].append({"sentence": item, "note": sentence_note})
            stats["examples"] += 1

    with open(OUT, "w", encoding="utf-8") as out:
        for point in points.values():
            out.write(json.dumps(point, ensure_ascii=False) + "\n")

    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()

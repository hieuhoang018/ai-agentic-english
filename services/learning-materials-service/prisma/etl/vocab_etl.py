#!/usr/bin/env python3
"""
Vocab-spine ETL for the learning-materials primitive layer.

Joins three open sources by lemma into one seed file:
  - CEFR-J vocabulary profile v1.5  -> CEFR level A1..B2   (cite TUFS / Tono Lab)
  - Octanove C1/C2 profile v1.0     -> CEFR level C1..C2   (CC BY-SA 4.0)
  - WordNet (Princeton, via NLTK)   -> definition / example / synonyms (permissive)
  - ipa-dict en_US (MIT)            -> IPA pronunciation(s)

Output: vocab_seed.jsonl  (one JSON object per vocab entry)
Every row carries `source` + `license` so the loader (prisma/seedVocab.ts)
can enforce a license allow-list (keeps CC BY-SA out of the shipped set by
default).

Offline-only: run manually with a Python env that has `nltk` + the WordNet
corpus downloaded, and the CEFR-J/Octanove/ipa-dict source files alongside
this script. Not part of any npm script or CI step. Re-run and copy the
output to ../seed-data/vocab_seed.jsonl when source data changes.
"""
import csv, json, re, sys
from nltk.corpus import wordnet as wn

CEFRJ_CSV    = "cefrj-vocab.csv"
OCTANOVE_CSV = "octanove-c1c2.csv"
IPA_TXT      = "ipa_en_US.txt"
OUT          = "vocab_seed.jsonl"

# CEFR-J part-of-speech -> WordNet pos tags (None = no WordNet lookup)
POS_TO_WN = {
    "noun": ["n"], "verb": ["v"],
    "adjective": ["a", "s"], "adverb": ["r"],
}

def load_ipa(path):
    """spelling(lower) -> list of IPA strings, primary first."""
    d = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            if "\t" not in line:
                continue
            word, prons = line.rstrip("\n").split("\t", 1)
            variants = [p.strip().strip("/[]") for p in prons.split(",") if p.strip()]
            if variants:
                d[word.lower()] = variants
    return d

def lookup_keys(headword):
    """CEFR-J headwords can bundle variants ('a.m./A.M./am/AM'); yield clean keys."""
    for part in headword.split("/"):
        k = part.strip().lower()
        if k:
            yield k

def wn_sense(headword, pos):
    """Primary WordNet sense for headword constrained to pos. Returns dict or None."""
    wn_tags = POS_TO_WN.get(pos)
    if not wn_tags:
        return None
    for key in lookup_keys(headword):
        term = key.replace(" ", "_")
        for tag in wn_tags:
            syns = wn.synsets(term, pos=tag)
            if syns:
                s = syns[0]
                synonyms = [l.name().replace("_", " ") for l in s.lemmas()
                            if l.name().replace("_", " ").lower() != key][:5]
                ex = s.examples()[:1]
                return {
                    "definition": s.definition(),
                    "example": ex[0] if ex else None,
                    "synonyms": synonyms,
                }
    return None

def ipa_for(headword, ipa_map):
    for key in lookup_keys(headword):
        if key in ipa_map:
            return ipa_map[key]
    return []

def read_level_file(path, source, license_str):
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            hw = (row.get("headword") or "").strip()
            pos = (row.get("pos") or "").strip().lower()
            cefr = (row.get("CEFR") or "").strip().upper()
            if hw and cefr:
                yield hw, pos, cefr, source, license_str

def main():
    ipa_map = load_ipa(IPA_TXT)
    seen = set()          # (lemma, pos) natural key -> dedupe, lower level wins
    stats = {"total": 0, "with_def": 0, "with_ipa": 0, "by_source": {}, "by_level": {}}

    # CEFR-J first (lower levels + permissive) so it wins on conflicts
    sources = [
        read_level_file(CEFRJ_CSV, "cefr-j",
                        "CEFR-J Wordlist v1.5 (free for commercial use with citation; (c) Tono Lab, TUFS)"),
        read_level_file(OCTANOVE_CSV, "octanove",
                        "CC BY-SA 4.0"),
    ]

    with open(OUT, "w", encoding="utf-8") as out:
        for src in sources:
            for hw, pos, cefr, source, lic in src:
                lemma = next(lookup_keys(hw), hw.lower())
                key = (lemma, pos)
                if key in seen:
                    continue
                seen.add(key)

                sense = wn_sense(hw, pos)
                ipas = ipa_for(hw, ipa_map)
                rec = {
                    "lemma": lemma,
                    "pos": pos,
                    "cefr_level": cefr,
                    "freq_rank": None,
                    "domain_tag": "general",
                    "source": source,
                    "license": lic,
                    "senses": [sense] if sense else [],
                    "pronunciations": [
                        {"ipa": p, "variant": "us", "is_primary": i == 0}
                        for i, p in enumerate(ipas)
                    ],
                }
                out.write(json.dumps(rec, ensure_ascii=False) + "\n")

                stats["total"] += 1
                stats["with_def"] += 1 if sense else 0
                stats["with_ipa"] += 1 if ipas else 0
                stats["by_source"][source] = stats["by_source"].get(source, 0) + 1
                stats["by_level"][cefr] = stats["by_level"].get(cefr, 0) + 1

    print(json.dumps(stats, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()

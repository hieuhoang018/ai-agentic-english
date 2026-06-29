#!/usr/bin/env python3
"""
State Dept "Everyday Conversations: Learning American English" — A1 dialogue ETL.

Source: https://americanenglish.state.gov/resources/everyday-conversations-american-english
PDF:    https://americanenglish.state.gov/files/ae/resource_files/b_dialogues_everyday_conversations_english_lo_0.pdf
License: U.S. government work, not subject to copyright in the US (17 U.S.C. §105).

Extracts 30 short dialogues from the PDF and writes text-only Passage records to
passage_seed.jsonl. No audio — the PDF is the primary distribution format for this
resource; per-dialogue mp3s are not publicly available.

PDF layout (two-column per dialogue):
  - Each turn: speech text (right col) → SPEAKER: label (left col) → continuation lines
  - pdfplumber reads the right column first within each visual row, so the extracted
    text order is: speech_line, SPEAKER:, continuation..., next_speech_line, SPEAKER2:, ...
  - Algorithm: for each SPEAKER: label at line i, their utterance =
      lines[i-1] + lines[i+1 : next_speaker_pos-1]

Usage:
    pip install pdfplumber
    python3 agents/tools/statedept_a1_etl.py [--dry-run]
    python3 agents/tools/statedept_a1_etl.py --pdf /path/to/local.pdf [--dry-run]
"""

import argparse
import json
import os
import re
import subprocess
import sys
import unicodedata

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
OUT = os.path.join(REPO_ROOT, "services", "learning-materials-service",
                   "prisma", "seed-data", "passage_seed.jsonl")
VOCAB_SEED = os.path.join(REPO_ROOT, "services", "learning-materials-service",
                          "prisma", "seed-data", "vocab_seed.jsonl")

PDF_URL = ("https://americanenglish.state.gov/files/ae/resource_files/"
           "b_dialogues_everyday_conversations_english_lo_0.pdf")
LICENSE = "U.S. Government Work (17 U.S.C. §105) — not subject to US copyright"
SOURCE = "U.S. Department of State — Everyday Conversations: Learning American English"

DIALOGUE_HEADER_RE = re.compile(
    r"Dialogue\s+(\d+[-.]?\d*)\s*[:-]\s*(.+?)(?:\s+\d+\s*$)?$", re.I | re.M
)
# ALL-CAPS words (1-3 words) followed by colon, alone on a line — speaker label
SPEAKER_RE = re.compile(r"^([A-Z][A-Z. ]{1,30}):$")
# Skip lines that are just page numbers ("4 5", "10 11", etc.)
PAGE_NUM_RE = re.compile(r"^\d+\s+\d+$")


def clean(line: str) -> str:
    """Strip BEL chars (\x07) used for word-spacing ligatures and normalise whitespace."""
    line = line.replace("\x07", " ")
    line = re.sub(r"[ \t]{2,}", " ", line)
    return line.strip()


def fix_drop_caps(utterance: str) -> str:
    """
    Fix PDF drop-cap extraction artifacts where the first letter of a word is
    separated by a space: 'H ello' → 'Hello', 'W e'd' → 'We'd'.
    Only applies at the start of an utterance (right after 'SPEAKER: ').
    Leaves standalone 'I' untouched so 'I think' stays 'I think'.
    """
    def join(m: re.Match) -> str:
        letter, rest = m.group(1), m.group(2)
        if letter == "I":
            return m.group(0)
        return letter + rest
    # Match a single uppercase letter + space + 2+ lowercase chars at utterance start
    return re.sub(r"^([A-Z]) ([a-z]{2,})", join, utterance)


def extract_dialogue_text(page_lines: list[str], title_line_idx: int) -> list[tuple[str, str]]:
    """
    Parse speaker turns from page lines starting after title_line_idx.
    Returns list of (speaker, utterance) pairs.

    The PDF reading order for each visual row is: RIGHT_COL (speech), then LEFT_COL (speaker label).
    So a turn is represented as:
        speech_part_1   ← first part of this speaker's utterance (right col of visual row N)
        SPEAKER_NAME:   ← speaker label (left col of visual row N)
        speech_part_2   ← continuation (right col of visual rows N+1, N+2, ...)
        NEXT_SPEECH_1   ← first part of NEXT speaker's utterance (right col of row M)
        NEXT_SPEAKER:   ← next speaker label
    """
    # Work on cleaned lines after the title, stop at LANGUAGE NOTES or end
    working = []
    for raw in page_lines[title_line_idx + 1:]:
        c = clean(raw)
        if re.search(r"LANGUAGE\s+NOTES", c, re.I):
            break
        working.append(c)

    # Find positions of all speaker labels
    speaker_positions: list[tuple[int, str]] = []
    for i, line in enumerate(working):
        m = SPEAKER_RE.match(line)
        if m:
            speaker_positions.append((i, m.group(1).strip()))

    if not speaker_positions:
        return []

    turns: list[tuple[str, str]] = []
    for turn_idx, (label_pos, speaker) in enumerate(speaker_positions):
        # First part: line immediately before this speaker's label
        first_part = working[label_pos - 1] if label_pos > 0 else ""

        # Continuation: lines after label until the line just before the next label
        if turn_idx + 1 < len(speaker_positions):
            next_label_pos = speaker_positions[turn_idx + 1][0]
            continuation_lines = working[label_pos + 1: next_label_pos - 1]
        else:
            continuation_lines = working[label_pos + 1:]

        # Filter continuation: skip page-number lines and empty lines
        continuation_clean = [
            l for l in continuation_lines
            if l and not PAGE_NUM_RE.match(l) and not re.search(r"LANGUAGE\s+NOTES", l, re.I)
        ]

        utterance = fix_drop_caps(" ".join([first_part] + continuation_clean).strip())
        if utterance:
            turns.append((speaker, utterance))

    return turns


def load_vocab_levels():
    levels: dict[str, str] = {}
    with open(VOCAB_SEED, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            r = json.loads(line)
            levels[r["lemma"].lower()] = r["cefr_level"]
    return levels


def estimate_cefr_level(text: str, vocab_levels: dict[str, str]) -> str:
    words = re.findall(r"[a-zA-Z']+", text.lower())
    cefr_order = ["A1", "A2", "B1", "B2", "C1", "C2"]
    matched = [vocab_levels[w] for w in words if w in vocab_levels]
    if not matched:
        return "A1"
    counts = {lvl: 0 for lvl in cefr_order}
    for lvl in matched:
        counts[lvl] = counts.get(lvl, 0) + 1
    cumulative, total = 0, len(matched)
    for lvl in cefr_order:
        cumulative += counts.get(lvl, 0)
        if cumulative / total >= 0.85:
            return lvl
    return "C2"


def load_existing_titles(path: str) -> set[str]:
    titles: set[str] = set()
    if not os.path.exists(path):
        return titles
    with open(path, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                titles.add(json.loads(line)["title"])
            except Exception:
                pass
    return titles


def download_pdf(url: str, dest: str):
    print(f"  Downloading PDF: {url}")
    result = subprocess.run(
        ["curl", "-sL", "--connect-timeout", "20", "--max-time", "120", url, "-o", dest],
        capture_output=True,
    )
    if result.returncode != 0:
        raise OSError(f"curl failed (exit {result.returncode}): {result.stderr.decode()[:200]}")


def main():
    try:
        import pdfplumber
    except ImportError:
        print("ERROR: pdfplumber not installed. Run: pip install pdfplumber")
        sys.exit(1)

    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--pdf", default=None, help="Path to local PDF (skip download)")
    args = parser.parse_args()

    existing_titles = load_existing_titles(OUT)
    print(f"Loaded {len(existing_titles)} existing passage titles (will skip)\n")

    # Download or use local PDF
    if args.pdf:
        pdf_path = args.pdf
    else:
        import tempfile
        pdf_path = os.path.join(tempfile.gettempdir(), "statedept_everyday_conversations.pdf")
        if not os.path.exists(pdf_path):
            download_pdf(PDF_URL, pdf_path)
        else:
            print(f"  Using cached PDF: {pdf_path}")

    vocab_levels = load_vocab_levels()

    stats = {"written": 0, "skipped_existing": 0, "skipped_empty": 0}

    with pdfplumber.open(pdf_path) as pdf:
        pages_text: list[list[str]] = [
            (p.extract_text() or "").split("\n") for p in pdf.pages
        ]

        print(f"=== State Dept Everyday Conversations — {len(pdf.pages)} pages ===\n")

        # First pass: collect ALL (dialogue_num, page_idx, line_idx) occurrences.
        # The TOC page lists every dialogue first; we want the LAST occurrence of each
        # num (the actual dialogue page) by keeping the latest one found.
        occurrences: dict[str, tuple[str, int, int]] = {}  # num → (topic, page_idx, line_idx)
        for page_idx, lines in enumerate(pages_text):
            for line_idx, raw_line in enumerate(lines):
                m = DIALOGUE_HEADER_RE.search(clean(raw_line))
                if not m:
                    continue
                dialogue_num = m.group(1).strip()
                topic_raw = m.group(2).strip()
                topic = re.sub(r"([a-z])([A-Z])", r"\1 \2", topic_raw)
                occurrences[dialogue_num] = (topic, page_idx, line_idx)

        # Second pass: process in num order (sorted numerically)
        def sort_key(num: str):
            parts = re.split(r"[-.]", num)
            return tuple(int(p) for p in parts if p.isdigit())

        for dialogue_num in sorted(occurrences, key=sort_key):
            topic, page_idx, line_idx = occurrences[dialogue_num]
            lines = pages_text[page_idx]
            title = f"Dialogue {dialogue_num}: {topic}"
            if True:

                if title in existing_titles:
                    stats["skipped_existing"] += 1
                    print(f"  SKIP (exists)  {title}")
                    continue

                # Try this page first; if no speaker labels found, try the next page
                turns = extract_dialogue_text(lines, line_idx)
                if not turns and page_idx + 1 < len(pages_text):
                    next_lines = pages_text[page_idx + 1]
                    # Check the next page isn't another dialogue
                    next_page_text = " ".join(next_lines)
                    if not DIALOGUE_HEADER_RE.search(next_page_text):
                        turns = extract_dialogue_text(next_lines, -1)

                if not turns:
                    # Fallback: look on the page 2 pages ahead (some dialogues span 2 pages)
                    if page_idx + 2 < len(pages_text):
                        turns = extract_dialogue_text(pages_text[page_idx + 2], -1)

                if not turns:
                    print(f"  SKIP (no text) {title}")
                    stats["skipped_empty"] += 1
                    continue

                # Build body as formatted dialogue text
                body_lines = [f"{speaker}: {utterance}" for speaker, utterance in turns]
                body = "\n".join(body_lines)

                cefr_level = estimate_cefr_level(body, vocab_levels)
                # These are A1 designed dialogues — cap at A1 if heuristic gives lower
                # (short simple dialogues often don't have many CEFR vocab matches)
                if cefr_level not in ("A1", "A2"):
                    cefr_level = "A1"

                row = {
                    "title": title,
                    "body": body,
                    "cefr_level": "A1",  # These are explicitly A1 teaching materials
                    "topic_tags": ["conversation", "dialogue", "everyday-english"],
                    "is_generated": False,
                    "source": SOURCE,
                    "license": LICENSE,
                    # No audio: media key omitted (text-only A1 reading passage)
                }

                if args.dry_run:
                    print(f"  [DRY-RUN] OK  [A1] {title}")
                    print(f"    turns={len(turns)}, words={len(body.split())}")
                    print(f"    first turn: {turns[0][0]}: {turns[0][1][:80]}...")
                else:
                    with open(OUT, "a", encoding="utf-8") as f:
                        f.write(json.dumps(row, ensure_ascii=False) + "\n")
                    print(f"  OK  [A1] {title} ({len(turns)} turns, {len(body.split())} words)")

                existing_titles.add(title)
                stats["written"] += 1

    if args.dry_run:
        print(f"\n[DRY-RUN] Would write {stats['written']} A1 passages (file not modified)")
    else:
        print(f"\nWrote {stats['written']} A1 passages to {OUT}")
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()

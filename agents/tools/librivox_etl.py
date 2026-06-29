#!/usr/bin/env python3
"""
LibriVox / Project Gutenberg ETL for reading/listening passages (public domain).

Supports literary short-story collections where audio is on archive.org (LibriVox)
and the full text is on Project Gutenberg. Both sources are public domain.

Series currently configured:
  ohenry-four-million  B2  Five stories from O. Henry's "The Four Million" (1906)
  poe-tales            C1  Five tales from Edgar Allan Poe (1839–1845)

Pipeline:
  1. Download full Gutenberg plain-text (via curl — avoids Python SSL quirks).
  2. Split into individual stories by detecting ALL-CAPS title headers (the
     standard Gutenberg convention for short-story collections).
  3. For each track in the series, download the LibriVox mp3 from archive.org.
  4. Upload mp3 to the `passage-audio` MinIO bucket.
  5. Estimate CEFR level (or use per-series override).
  6. Append one JSON row to passage_seed.jsonl.

Runs in APPEND mode: titles already present in the output file are not
written again. Their MinIO audio object is still checked and uploaded if
missing, so this script can populate a fresh local MinIO from committed seed
metadata without duplicating JSONL rows.

Manual run (from repo root or agents/tools/):
    pip3 install boto3
    python3 agents/tools/librivox_etl.py [--series SERIES_NAME] [--dry-run]

  --series (optional): only run this series; omit to run all series.
  --dry-run: fetch and print what would be written, skip MinIO upload.

MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY from env (defaults
match infra/docker-compose.yml host-exposed port).
"""
import argparse
import json
import os
import re
import subprocess
import sys
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
LICENSE = "Public domain (pre-1928 work)"

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(
    _SCRIPT_DIR, "..", "..", "services", "learning-materials-service",
    "prisma", "seed-data", "passage_seed.jsonl",
)
VOCAB_SEED = os.path.join(
    _SCRIPT_DIR, "..", "..", "services", "learning-materials-service",
    "prisma", "seed-data", "vocab_seed.jsonl",
)
MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "http://localhost:9000")
MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "minioadmin")
BUCKET = "passage-audio"
CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]

# ---------------------------------------------------------------------------
# Series configuration
# ---------------------------------------------------------------------------
# Each series specifies:
#   gutenberg_url   plain-text (.txt) URL on gutenberg.org/cache/epub/...
#   gutenberg_start pattern that marks the actual text start (after boilerplate)
#   tracks          list of {story_title, mp3_url, slug} — story_title must
#                   match the ALL-CAPS title header in the Gutenberg text
#   cefr_override   force a level (None = let heuristic decide)
#   topic_tags      list of tag strings
#   source          human-readable provenance string
#   audio_prefix    MinIO object key prefix for uploads

SERIES = [
    # --- B2: O. Henry short stories ---
    # Audio: LibriVox "Five Stories by O. Henry" (archive.org)
    # Text:  Project Gutenberg "The Four Million" (#2776) by O. Henry
    # All stories are in the public domain (published 1903–1906, US).
    # Override to B2: the vocab heuristic gives A2 because archaic/literary words
    # ("vestibule", "parsimony", "imputation") are not in the CEFR spine, so
    # matched words skew toward A1/A2 common function words.
    {
        "name": "ohenry-four-million",
        "gutenberg_url": "http://gutenberg.pglaf.org/2/7/7/2776/2776-0.txt",
        "cefr_override": "B2",
        "topic_tags": ["literature", "fiction", "american-literature"],
        "source": "LibriVox / Project Gutenberg — O. Henry, The Four Million (public domain)",
        "audio_prefix": "librivox/ohenry/",
        "tracks": [
            {
                "story_title": "THE GIFT OF THE MAGI",
                "mp3_url": "https://archive.org/download/5belovedstories_ohenry_pc_librivox/5belovedstoriesbyohenry_1_henry_64kb.mp3",
                "slug": "the-gift-of-the-magi",
            },
            {
                "story_title": "A COSMOPOLITE IN A CAFÉ",
                "mp3_url": "https://archive.org/download/5belovedstories_ohenry_pc_librivox/5belovedstoriesbyohenry_2_henry_64kb.mp3",
                "slug": "a-cosmopolite-in-a-cafe",
            },
            {
                "story_title": "THE COP AND THE ANTHEM",
                "mp3_url": "https://archive.org/download/5belovedstories_ohenry_pc_librivox/5belovedstoriesbyohenry_3_henry_64kb.mp3",
                "slug": "the-cop-and-the-anthem",
            },
            {
                "story_title": "MAN ABOUT TOWN",
                "mp3_url": "https://archive.org/download/5belovedstories_ohenry_pc_librivox/5belovedstoriesbyohenry_4_henry_64kb.mp3",
                "slug": "man-about-town",
            },
            {
                "story_title": "MAMMON AND THE ARCHER",
                "mp3_url": "https://archive.org/download/5belovedstories_ohenry_pc_librivox/5belovedstoriesbyohenry_5_henry_64kb.mp3",
                "slug": "mammon-and-the-archer",
            },
        ],
    },
    # --- C1: Edgar Allan Poe tales ---
    # Audio: LibriVox "12 Creepy Tales by Edgar Allan Poe" (archive.org: 12_creepytales_1206_librivox)
    # Text:  Project Gutenberg "Works of Edgar Allan Poe, Vol. II" (#2148, PGLAF mirror)
    # All works pre-1928, public domain in the US.
    #
    # Story titles in eBook 2148 end with a trailing period — "THE BLACK CAT." —
    # so story_title must include that period for find/split to match. The display
    # title strips trailing punctuation before title-casing.
    #
    # Override to C1: Poe's Gothic vocabulary ("sepulchral", "phantasmagoric",
    # "impalpable") is largely absent from the CEFR spine; the heuristic would
    # return A2 based only on common function words.
    {
        "name": "poe-tales",
        "gutenberg_url": "http://gutenberg.pglaf.org/2/1/4/2148/2148-0.txt",
        "cefr_override": "C1",
        "topic_tags": ["literature", "fiction", "gothic", "mystery"],
        "source": "LibriVox / Project Gutenberg — Edgar Allan Poe, Works Vol. II (public domain)",
        "audio_prefix": "librivox/poe/",
        "tracks": [
            {
                "story_title": "THE TELL-TALE HEART.",
                "mp3_url": "https://archive.org/download/12_creepytales_1206_librivox/creepytalesbypoe_01_poe_64kb.mp3",
                "slug": "the-tell-tale-heart",
            },
            {
                "story_title": "THE BLACK CAT.",
                "mp3_url": "https://archive.org/download/12_creepytales_1206_librivox/creepytalesbypoe_03_poe_64kb.mp3",
                "slug": "the-black-cat",
            },
            {
                "story_title": "THE CASK OF AMONTILLADO.",
                "mp3_url": "https://archive.org/download/12_creepytales_1206_librivox/creepytalesbypoe_06_poe_64kb.mp3",
                "slug": "the-cask-of-amontillado",
            },
        ],
    },
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def fetch_binary(url):
    """Download binary content (mp3) via urllib."""
    parsed = urllib.parse.urlsplit(url)
    safe_path = urllib.parse.quote(parsed.path, safe="/:@!$&'()*+,;=")
    safe_url = urllib.parse.urlunsplit(parsed._replace(path=safe_path))
    req = urllib.request.Request(safe_url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def fetch_text(url):
    """
    Download plain text via curl (avoids Python SSL quirks on some systems).
    Uses a neutral User-Agent — Gutenberg/PGLAF serve a different text format
    (missing ALL-CAPS story headings) when given a browser UA.
    """
    result = subprocess.run(
        ["curl", "-sL", "--connect-timeout", "30", "--max-time", "90", url],
        capture_output=True,
    )
    if result.returncode != 0:
        raise OSError(f"curl failed (exit {result.returncode}) for {url}: {result.stderr.decode()[:200]}")
    return result.stdout.decode("utf-8", errors="ignore")


def normalize_title(title):
    """Normalize to ASCII uppercase for fuzzy matching against Gutenberg titles."""
    nfc = unicodedata.normalize("NFC", title.upper())
    # Strip combining characters (accents) — CAFÉ → CAFE
    return "".join(c for c in unicodedata.normalize("NFD", nfc)
                   if unicodedata.category(c) != "Mn")


def load_vocab_levels():
    levels = {}
    with open(VOCAB_SEED, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            rec = json.loads(line)
            levels[rec["lemma"].lower()] = rec["cefr_level"]
    return levels


def estimate_cefr_level(body, vocab_levels):
    words = re.findall(r"[a-zA-Z']+", body.lower())
    matched = [vocab_levels[w] for w in words if w in vocab_levels]
    if len(matched) < 10:
        return "B1"
    counts = Counter(matched)
    cumulative, threshold = 0, 0.85 * len(matched)
    for level in CEFR_ORDER:
        cumulative += counts.get(level, 0)
        if cumulative >= threshold:
            return level
    return "B2"


def load_existing_titles():
    titles = set()
    if not os.path.exists(OUT):
        return titles
    with open(OUT, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                try:
                    rec = json.loads(line)
                    titles.add(rec.get("title", ""))
                except json.JSONDecodeError:
                    pass
    return titles


def upload_audio(s3, audio_prefix, slug, audio_bytes):
    object_key = f"{audio_prefix}{slug}.mp3"
    s3.put_object(Bucket=BUCKET, Key=object_key, Body=audio_bytes, ContentType="audio/mpeg")
    return object_key


def object_exists(s3, object_key):
    try:
        s3.head_object(Bucket=BUCKET, Key=object_key)
        return True
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise


# ---------------------------------------------------------------------------
# Gutenberg text splitting
# ---------------------------------------------------------------------------

def extract_gutenberg_boilerplate_stripped(full_text):
    """Return text between START and END markers."""
    start_m = re.search(r"\*\*\* START OF THE PROJECT GUTENBERG EBOOK[^\n]*\n", full_text, re.I)
    end_m = re.search(r"\*\*\* END OF THE PROJECT GUTENBERG EBOOK", full_text, re.I)
    body = full_text
    if start_m:
        body = body[start_m.end():]
    if end_m:
        body = body[: body.find("*** END OF THE PROJECT GUTENBERG")]
    return body


def find_all_story_boundaries(body):
    """
    Return a sorted list of story TITLE START positions (not content positions)
    by detecting all standalone ALL-CAPS title lines in the original body.

    We use an inclusive Unicode character class so titles like "A COSMOPOLITE
    IN A CAFÉ" (ending with É, U+00C9) and "TOBIN’S PALM" (with U+2019) are
    detected. TOC entries are indented with a leading space and are skipped
    by the (?:^|\\n)(TITLE) pattern.

    Returns list of positions pointing to the FIRST CHARACTER of each detected title.
    """
    UCASE = r"[A-ZÀ-ÖØ-Þ]"
    BODY_CHARS = r"[A-ZÀ-ÖØ-Þ’’’ \-\,/]"
    # Optional trailing period/exclamation for titles like "THE BLACK CAT."
    title_re = re.compile(
        r"(?:^|\r?\n)(" + UCASE + BODY_CHARS + r"{3,}" + UCASE + r"[.!]?)(?:\r?\n|$)"
    )
    skip = {"GUTENBERG", "LICENSE", "TRADEMARK", "DISTRIBUTE",
            "INCIDENTAL", "IMPLIED", "WARRANTY", "BREACH", "LIABILITY"}
    positions = []
    for m in title_re.finditer(body):
        t = m.group(1).strip()
        if len(t.split()) >= 2 and len(t) >= 8 and not set(t.split()) & skip:
            positions.append(m.start(1))  # position of first char of title
    return sorted(set(positions))


def split_stories(body, tracks):
    """
    Given stripped Gutenberg text and a list of tracks (with `story_title`),
    return a dict mapping story_title → story text.

    Strategy:
    1. Detect ALL story TITLE positions for correct boundary detection (including
       titles not targeted, e.g. intermediate O. Henry stories).
    2. For each target track: find its content start (after the title line).
    3. Story end = position of the NEXT title (from the full boundary list),
       so trailing blank lines + next title header are excluded by .strip().
    """
    all_title_positions = find_all_story_boundaries(body)

    result = {}
    for track in tracks:
        title = track["story_title"]
        # Find this title as a standalone (non-indented) line in the original body
        # Use \r?\n to handle both LF and CRLF line endings
        pattern = r"(?:^|\r?\n)(" + re.escape(title) + r")(?:\r?\n|$)"
        matches = list(re.finditer(pattern, body))
        if not matches:
            print(f"  WARN: could not locate ‘{title}’ in Gutenberg text")
            continue
        # TOC entries have leading spaces → skipped by pattern. Usually one match.
        m = matches[1] if len(matches) >= 2 else matches[0]
        title_pos = m.start(1)   # first char of this story’s title
        content_start = m.end()  # first char of story content (after title + \n)

        # Combine detected positions with this title’s position for reliable sorting
        all_positions = sorted(set(all_title_positions + [title_pos]))

        # End = start of next title after this one
        end_pos = next((p for p in all_positions if p > title_pos), len(body))
        result[title] = body[content_start:end_pos].strip()

    return result


def story_text_from_standalone(full_text):
    """For single-story Gutenberg files, return stripped body."""
    return extract_gutenberg_boilerplate_stripped(full_text).strip()


# ---------------------------------------------------------------------------
# Series runners
# ---------------------------------------------------------------------------

def run_collection_series(series_cfg, vocab_levels, s3, existing_titles, out_path, dry_run=False):
    """
    Series where all stories come from a single Gutenberg file (e.g. O. Henry).
    series_cfg["gutenberg_url"] must be non-None.
    """
    name = series_cfg["name"]
    tracks = series_cfg["tracks"]
    cefr_override = series_cfg.get("cefr_override")
    source = series_cfg["source"]
    audio_prefix = series_cfg["audio_prefix"]
    topic_tags = series_cfg["topic_tags"]
    stats = {"fetched": 0, "skipped_existing": 0, "skipped_incomplete": 0}
    count = 0

    print(f"  Downloading Gutenberg text: {series_cfg['gutenberg_url']}")
    full_text = fetch_text(series_cfg["gutenberg_url"])
    body = extract_gutenberg_boilerplate_stripped(full_text)
    story_texts = split_stories(body, tracks)

    for track in tracks:
        title = track["story_title"]
        # Use title-case for display and JSONL storage.
        # Strip trailing punctuation first — Poe titles end with "." in the Gutenberg text.
        display_title = title.rstrip(".!?").title()
        display_title = display_title.replace(" In ", " in ").replace(" A ", " a ").replace(" The ", " the ").replace(" And ", " and ").replace(" Of ", " of ")
        display_title = display_title.strip()

        story_body = story_texts.get(title, "")
        if not story_body:
            stats["skipped_incomplete"] += 1
            print(f"  SKIP (no text) {display_title}")
            continue

        cefr_level = cefr_override or estimate_cefr_level(story_body, vocab_levels)
        slug = track["slug"]
        mp3_url = track["mp3_url"]
        object_key = f"{audio_prefix}{slug}.mp3"

        if display_title in existing_titles or title in existing_titles:
            stats["skipped_existing"] += 1
            if dry_run:
                print(f"  SKIP (exists)  {display_title}")
            elif object_exists(s3, object_key):
                print(f"  SKIP (exists, audio present)  {display_title}")
            else:
                audio_bytes = fetch_binary(mp3_url)
                upload_audio(s3, audio_prefix, slug, audio_bytes)
                print(f"  OK  (audio restored) {display_title} ({len(audio_bytes)} bytes → {object_key})")
            continue

        if not dry_run:
            audio_bytes = fetch_binary(mp3_url)
            object_key = upload_audio(s3, audio_prefix, slug, audio_bytes)
            with open(out_path, "a", encoding="utf-8") as f:
                row = {
                    "title": display_title,
                    "body": story_body,
                    "cefr_level": cefr_level,
                    "topic_tags": topic_tags,
                    "is_generated": False,
                    "source": source,
                    "license": LICENSE,
                    "media": {
                        "object_key": object_key,
                        "mime": "audio/mpeg",
                        "duration_ms": None,
                        "transcript": story_body,
                        "alignment": None,
                        "source": source,
                        "license": LICENSE,
                    },
                }
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        else:
            object_key = f"{audio_prefix}{slug}.mp3"
            audio_bytes = b""

        existing_titles.add(display_title)
        stats["fetched"] += 1
        count += 1
        marker = "[DRY-RUN] " if dry_run else ""
        audio_size = len(audio_bytes) if not dry_run else 0
        print(f"  {marker}OK  [{cefr_level}] {display_title} ({audio_size} bytes → {object_key})")

    return count, stats


def run_standalone_series(series_cfg, vocab_levels, s3, existing_titles, out_path, dry_run=False):
    """
    Series where each story/track has its own Gutenberg URL
    (e.g. Poe — each story is a separate Gutenberg ebook).
    """
    name = series_cfg["name"]
    tracks = series_cfg["tracks"]
    cefr_override = series_cfg.get("cefr_override")
    source = series_cfg["source"]
    audio_prefix = series_cfg["audio_prefix"]
    topic_tags = series_cfg["topic_tags"]
    stats = {"fetched": 0, "skipped_existing": 0, "skipped_incomplete": 0}
    count = 0

    for track in tracks:
        title = track["story_title"]

        print(f"  Downloading Gutenberg text for '{title}': {track['gutenberg_url']}")
        full_text = fetch_text(track["gutenberg_url"])
        story_body = story_text_from_standalone(full_text)

        # If this is a multi-story file, extract just this story
        if track.get("story_title"):
            extracted = split_stories(story_body, [track])
            if extracted.get(track["story_title"]):
                story_body = extracted[track["story_title"]]

        if not story_body or len(story_body) < 200:
            stats["skipped_incomplete"] += 1
            print(f"  SKIP (no text) {title}")
            continue

        cefr_level = cefr_override or estimate_cefr_level(story_body, vocab_levels)
        slug = track["slug"]
        mp3_url = track["mp3_url"]
        object_key = f"{audio_prefix}{slug}.mp3"

        if title in existing_titles:
            stats["skipped_existing"] += 1
            if dry_run:
                print(f"  SKIP (exists)  {title}")
            elif object_exists(s3, object_key):
                print(f"  SKIP (exists, audio present)  {title}")
            else:
                audio_bytes = fetch_binary(mp3_url)
                upload_audio(s3, audio_prefix, slug, audio_bytes)
                print(f"  OK  (audio restored) {title} ({len(audio_bytes)} bytes → {object_key})")
            continue

        if not dry_run:
            audio_bytes = fetch_binary(mp3_url)
            object_key = upload_audio(s3, audio_prefix, slug, audio_bytes)
            with open(out_path, "a", encoding="utf-8") as f:
                row = {
                    "title": title,
                    "body": story_body,
                    "cefr_level": cefr_level,
                    "topic_tags": topic_tags,
                    "is_generated": False,
                    "source": source,
                    "license": LICENSE,
                    "media": {
                        "object_key": object_key,
                        "mime": "audio/mpeg",
                        "duration_ms": None,
                        "transcript": story_body,
                        "alignment": None,
                        "source": source,
                        "license": LICENSE,
                    },
                }
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        else:
            object_key = f"{audio_prefix}{slug}.mp3"
            audio_bytes = b""

        existing_titles.add(title)
        stats["fetched"] += 1
        count += 1
        marker = "[DRY-RUN] " if dry_run else ""
        audio_size = len(audio_bytes) if not dry_run else 0
        print(f"  {marker}OK  [{cefr_level}] {title} ({audio_size} bytes → {object_key})")

    return count, stats


def run_series(series_cfg, vocab_levels, s3, existing_titles, out_path, dry_run=False):
    if series_cfg["gutenberg_url"] is not None:
        return run_collection_series(series_cfg, vocab_levels, s3, existing_titles, out_path, dry_run)
    else:
        return run_standalone_series(series_cfg, vocab_levels, s3, existing_titles, out_path, dry_run)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--series", help="Only run this series (by name); omit for all")
    parser.add_argument("--dry-run", action="store_true", help="Skip MinIO upload/write")
    args = parser.parse_args()

    s3 = None
    if not args.dry_run:
        s3 = boto3.client(
            "s3",
            endpoint_url=MINIO_ENDPOINT,
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",
        )

    vocab_levels = load_vocab_levels()
    existing_titles = load_existing_titles()
    print(f"Loaded {len(existing_titles)} existing passage titles (will skip)")

    series_to_run = SERIES
    if args.series:
        series_to_run = [s for s in SERIES if s["name"] == args.series]
        if not series_to_run:
            print(f"Unknown series '{args.series}'. Available: {[s['name'] for s in SERIES]}")
            sys.exit(1)

    total_fetched = 0
    total_stats = {"fetched": 0, "skipped_existing": 0, "skipped_incomplete": 0}
    for cfg in series_to_run:
        n = len(cfg["tracks"])
        print(f"\n=== Series: {cfg['name']} ({n} tracks) ===")
        count, stats = run_series(cfg, vocab_levels, s3, existing_titles, OUT, dry_run=args.dry_run)
        total_fetched += count
        for k, v in stats.items():
            total_stats[k] += v

    if total_fetched > 0 and not args.dry_run:
        print(f"\nWrote {total_fetched} new passages to {OUT}")
    elif total_fetched > 0 and args.dry_run:
        print(f"\n[DRY-RUN] Would write {total_fetched} passages (file not modified)")
    else:
        print("\nNo new passages to write.")
    print(json.dumps(total_stats, indent=2))


if __name__ == "__main__":
    main()

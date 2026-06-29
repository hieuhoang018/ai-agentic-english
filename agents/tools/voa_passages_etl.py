#!/usr/bin/env python3
"""
Reading/listening passage ETL for the learning-materials primitive layer
(Phase B of docs/learning-materials-content-roadmap.md).

Supports multiple VOA Special English series, all U.S. government works
(public domain, 17 U.S.C. §105). Three series currently configured:

  words-and-their-stories  A2  learningenglish.voanews.com  (26 articles)
  people-in-america        A2  manythings.org/voa/people/   (biographies)
  explorations-space       B1  manythings.org/voa/space/    (space history)

Each series has a different HTML transcript format:
  - words-and-their-stories: <br /> separated text in class="wsw" div,
    <audio src="..."> tag for the mp3.
  - people-in-america / explorations-space: <p> tag transcript, mp3 URL in
    an <a href="...mp3"> link.

Pipeline: fetch article page → extract title + transcript + mp3 URL →
download mp3 → upload to `passage-audio` MinIO bucket → estimate CEFR level
(or use per-series override) → append one JSON row to passage_seed.jsonl.

Runs in APPEND mode by default: titles already present in the output file
are skipped, so re-running the script never re-downloads existing audio.

Manual run (from repo root or agents/tools/):
    pip3 install boto3
    python3 agents/tools/voa_passages_etl.py [--series SERIES_NAME]

  --series (optional): only run this series; omit to run all series.
  --dry-run: fetch and print what would be written, skip MinIO upload.

MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY from env (defaults
match infra/docker-compose.yml host-exposed port).
"""
import argparse
import html as htmlmod
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter

import boto3
from botocore.client import Config

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
LICENSE = "U.S. government work — public domain (17 U.S.C. §105)"

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

SERIES = [
    # --- A2: idiom explainer segments ---
    {
        "name": "words-and-their-stories",
        "base_url": "https://learningenglish.voanews.com/a/",
        "articles": [
            "watching-the-grass-grow-is-not-fun/8003108.html",
            "words-and-their-stories-green-idioim-expressions-garden-jealousy/2688277.html",
            "how-to-dish-up-something-good/7980848.html",
            "the-importance-of-being-dialed-in-/7979814.html",
            "don-t-miss-a-thing-with-eagle-eyes-/7963085.html",
            "what-does-it-take-to-be-a-power-couple-/7963076.html",
            "what-are-kitchen-table-politics-/7953635.html",
            "sometimes-we-spread-ourself-too-thin-/7940837.html",
            "knee-jerk-when-you-are-not-in-control-/7937763.html",
            "the-story-of-jack-frost-/7932530.html",
            "kicking-off-a-new-year/7922042.html",
            "expressions-for-new-year-s-resolution/6896754.html",
            "an-eye-for-an-eye/7764503.html",
            "words-and-their-stories-dont-look-a-gift-horse-in-the-mouth/4168731.html",
            "words-and-their-stories-from-monkeys-to-potatoes/4141925.html",
            "keep-your-nose-to-the-grindstone/7796985.html",
            "partners-in-crime/7684146.html",
            "exploring-the-butterfly-effect-/7835956.html",
            "reaching-the-tipping-point-/7750319.html",
            "many-handy-hand-expressions-/7621434.html",
            "when-in-rome-/7816325.html",
            "be-careful-what-you-bank-on-/7703514.html",
            "one-person-s-trash-is-another-person-s-treasure-/7733886.html",
            "are-you-windshield-or-bug-/7575872.html",
            "what-is-your-north-star-/7782072.html",
            "is-pie-in-the-sky-just-a-dream-/7806461.html",
        ],
        "extractor": "br",
        "cefr_override": None,
        "topic_tags": ["idioms-and-expressions"],
        "source": "VOA Learning English — Words and Their Stories (learningenglish.voanews.com)",
        "audio_prefix": "voa/words-and-their-stories/",
    },
    # --- A2: biographies of notable Americans ---
    {
        "name": "people-in-america",
        "base_url": "https://www.manythings.org/voa/people/",
        "articles": [
            "Frederick_Douglass.html",
            "Rosa_Parks.html",
            "Jesse_Owens.html",
            "Thomas_Edison.html",
            "Mark_Twain.html",
            "Walt_Disney.html",
            "Cesar_Chavez.html",
            "Louis_Armstrong.html",
            "Ella_Fitzgerald.html",
            "Jackson_Pollock.html",
            "Jackie_Robinson.html",
            "Paul_Newman.html",
        ],
        "extractor": "p",
        "cefr_override": None,
        "topic_tags": ["biography", "american-history"],
        "source": "VOA Special English — People in America (manythings.org/voa/people/)",
        "audio_prefix": "voa/people-in-america/",
    },
    # --- B1: history of space exploration ---
    {
        "name": "explorations-space",
        "base_url": "https://www.manythings.org/voa/space/",
        "articles": [
            "1.html", "2.html", "3.html", "4.html", "5.html", "6.html",
            "7.html", "8.html", "9.html", "10.html", "12.html", "13.html",
        ],
        "extractor": "p",
        "cefr_override": None,
        "topic_tags": ["science", "space", "technology"],
        "source": "VOA Special English — Explorations (manythings.org/voa/space/)",
        "audio_prefix": "voa/explorations-space/",
    },
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def fetch(url):
    # URL-encode the path component to handle filenames with spaces or special chars
    parsed = urllib.parse.urlsplit(url)
    safe_path = urllib.parse.quote(parsed.path, safe="/:@!$&'()*+,;=")
    safe_url = urllib.parse.urlunsplit(parsed._replace(path=safe_path))
    req = urllib.request.Request(safe_url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


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


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


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


# ---------------------------------------------------------------------------
# Per-series extractors
# ---------------------------------------------------------------------------

def extract_br_article(raw_html):
    """Words and Their Stories: <br /> separated body inside class="wsw"."""
    raw = raw_html if isinstance(raw_html, str) else raw_html.decode("utf-8", errors="ignore")

    title_m = re.search(r'content="([^"]*?)"\s*property="og:title"', raw)
    title = htmlmod.unescape(title_m.group(1)).strip() if title_m else None

    mp3_m = re.search(r'<audio src="(https://[^"]*?\.mp3)"', raw)
    mp3_url = mp3_m.group(1) if mp3_m else None

    wsw_idx = raw.find('class="wsw"')
    if wsw_idx == -1:
        return title, mp3_url, ""
    tail = raw[wsw_idx:]
    glossary_idx = tail.find("Words in This Story")
    body_html = tail[:glossary_idx] if glossary_idx != -1 else tail

    paragraphs = []
    for seg in re.split(r"<br\s*/?>", body_html):
        text = htmlmod.unescape(re.sub(r"<[^>]+>", "", seg)).strip()
        text = re.sub(r"\s+", " ", text)
        if text and re.search(r"[A-Za-z]{4,}", text) and len(text) > 40:
            paragraphs.append(text)

    return title, mp3_url, "\n\n".join(paragraphs)


def extract_p_article(raw_html):
    """manythings.org articles: <p> tag body, mp3 in <a href="...mp3">."""
    raw = raw_html if isinstance(raw_html, str) else raw_html.decode("utf-8", errors="ignore")

    title_m = re.search(r"<title>([^<]+)</title>", raw, re.I)
    raw_title = htmlmod.unescape(title_m.group(1)).strip() if title_m else None
    # Strip common manythings.org title suffixes:
    #   "(VOA Special English 2007-09-29)"  or  "(VOA Special English)"
    #   "- People in America"
    if raw_title:
        raw_title = re.sub(r"\s*\(VOA Special English[^)]*\)\s*$", "", raw_title).strip()
        raw_title = re.sub(r"\s*-\s*(People in America|Manythings\.org)\s*$", "", raw_title, flags=re.I).strip()

    mp3_m = re.search(r'href="(https?://[^"]*?\.mp3)"', raw)
    mp3_url = mp3_m.group(1) if mp3_m else None

    paras = re.findall(r"<p[^>]*>(.*?)</p>", raw, re.S)
    paragraphs = []
    for p in paras:
        text = htmlmod.unescape(re.sub(r"<[^>]+>", "", p)).strip()
        text = re.sub(r"\s+", " ", text)
        if text and len(text) > 40 and re.search(r"[A-Za-z]{4,}", text):
            paragraphs.append(text)

    return raw_title, mp3_url, "\n\n".join(paragraphs)


EXTRACTORS = {
    "br": extract_br_article,
    "p": extract_p_article,
}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def upload_audio(s3, audio_prefix, slug, audio_bytes):
    object_key = f"{audio_prefix}{slug}.mp3"
    s3.put_object(Bucket=BUCKET, Key=object_key, Body=audio_bytes, ContentType="audio/mpeg")
    return object_key


def run_series(series_cfg, vocab_levels, s3, existing_titles, out_path, dry_run=False):
    name = series_cfg["name"]
    base_url = series_cfg["base_url"]
    articles = series_cfg["articles"]
    extractor = EXTRACTORS[series_cfg["extractor"]]
    cefr_override = series_cfg.get("cefr_override")
    topic_tags = series_cfg["topic_tags"]
    source = series_cfg["source"]
    audio_prefix = series_cfg["audio_prefix"]
    stats = {"fetched": 0, "skipped_existing": 0, "skipped_incomplete": 0}

    count = 0
    for slug_path in articles:
        url = base_url + slug_path
        raw = fetch(url)
        raw_str = raw.decode("utf-8", errors="ignore")
        title, mp3_url, body = extractor(raw_str)

        if not title or not mp3_url or not body:
            stats["skipped_incomplete"] += 1
            print(f"  SKIP (incomplete) {url} title={bool(title)} mp3={bool(mp3_url)} body={bool(body)}")
            continue

        if title in existing_titles:
            stats["skipped_existing"] += 1
            print(f"  SKIP (exists)  {title}")
            continue

        # Derive audio object key slug from the article filename
        file_slug = slugify(os.path.splitext(slug_path.split("/")[-1])[0])
        cefr_level = cefr_override or estimate_cefr_level(body, vocab_levels)

        if not dry_run:
            audio_bytes = fetch(mp3_url)
            object_key = upload_audio(s3, audio_prefix, file_slug, audio_bytes)
            # Write incrementally so a later failure doesn't lose earlier successes
            with open(out_path, "a", encoding="utf-8") as f:
                row = {
                    "title": title,
                    "body": body,
                    "cefr_level": cefr_level,
                    "topic_tags": topic_tags,
                    "is_generated": False,
                    "source": source,
                    "license": LICENSE,
                    "media": {
                        "object_key": object_key,
                        "mime": "audio/mpeg",
                        "duration_ms": None,
                        "transcript": body,
                        "alignment": None,
                        "source": source,
                        "license": LICENSE,
                    },
                }
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        else:
            object_key = f"{audio_prefix}{file_slug}.mp3"
            audio_bytes = b""

        existing_titles.add(title)
        stats["fetched"] += 1
        count += 1
        marker = "[DRY-RUN] " if dry_run else ""
        audio_size = len(audio_bytes) if not dry_run else 0
        print(f"  {marker}OK  [{cefr_level}] {title} ({audio_size} bytes → {object_key})")

    return count, stats


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--series", help="Only run this series (by name); omit for all")
    parser.add_argument("--dry-run", action="store_true", help="Skip MinIO upload")
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
        print(f"\n=== Series: {cfg['name']} ({len(cfg['articles'])} articles) ===")
        count, stats = run_series(cfg, vocab_levels, s3, existing_titles, OUT, dry_run=args.dry_run)
        total_fetched += count
        for k, v in stats.items():
            total_stats[k] += v

    if total_fetched > 0 and not args.dry_run:
        print(f"\nWrote {total_fetched} new passages to {OUT}")
    elif total_fetched > 0 and args.dry_run:
        print(f"\n[DRY-RUN] Would write {total_fetched} new passages (file not modified)")
    else:
        print("\nNo new passages to write.")

    print(json.dumps(total_stats, indent=2))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Reading/listening passage ETL for the learning-materials primitive layer
(Phase B of docs/learning-materials-content-roadmap.md).

Source: VOA Learning English's "Words and Their Stories" series
(learningenglish.voanews.com) — short (1-4 min) idiom explainer segments,
each with a plain-text transcript and a paired mp3 narration. VOA is a U.S.
government-funded broadcaster; works produced by federal employees in the
course of their official duties are public domain in the US (17 U.S.C. §105).

Pipeline (per the roadmap's actor flow): fetch each article page, extract
title + transcript + mp3 URL, download the mp3, upload it to the
`passage-audio` MinIO bucket, estimate a CEFR level by cross-referencing
transcript words against the already-seeded vocab spine (prisma/seed-data/
vocab_seed.jsonl) — no LLM call, consistent with "no TS-side/Phase-B
inference" — then write one JSON row per passage (with the resulting
audioKey already pointing at the uploaded object) to grammar_seed.jsonl's
sibling, passage_seed.jsonl. The TS loader (prisma/seedPassages.ts) only
ever stores that string; this script is the only thing in the repo that
talks to MinIO for this content.

Offline-only, manual run: requires `boto3` + a reachable MinIO at
MINIO_ENDPOINT (defaults match infra/docker-compose.yml's host-exposed
port). Re-run on demand for more articles — append new URLs to ARTICLES.
"""
import html as htmlmod
import json
import os
import re
import urllib.request
from collections import Counter

import boto3
from botocore.client import Config

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
BASE = "https://learningenglish.voanews.com/a/"
SOURCE = "VOA Learning English — Words and Their Stories (learningenglish.voanews.com)"
LICENSE = "U.S. government work — public domain (17 U.S.C. §105)"
TOPIC_TAGS = ["idioms-and-expressions"]

# "Words and Their Stories" article slugs, hand-picked from the series index
# (https://learningenglish.voanews.com/z/987) for this first pilot batch.
ARTICLES = [
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
    # Second batch (2026-06-24) — each hand-verified to have a real `class="wsw"`
    # transcript section and a downloadable mp3 before being added here. Found via
    # web search for individual episode permalinks rather than the site's own
    # listing pages: the live /z/987 index and /z/987/episodes pagination only
    # ever surface a rotating set of ~12 recent items, and the podcast RSS feed's
    # <link> values point at a separate "syndication" id per episode that 404s on
    # transcript content (no `wsw` div at all) even though a real, fully-transcribed
    # permalink exists at a different id for the same episode.
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
]

OUT = "passage_seed.jsonl"
VOCAB_SEED = os.path.join(
    os.path.dirname(__file__), "..", "..", "services", "learning-materials-service",
    "prisma", "seed-data", "vocab_seed.jsonl",
)
MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "http://localhost:9000")
MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "minioadmin")
BUCKET = "passage-audio"

CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def extract_article(raw_html):
    title_m = re.search(r'content="([^"]*)"\s*property="og:title"', raw_html)
    title = htmlmod.unescape(title_m.group(1)).strip() if title_m else None

    mp3_m = re.search(r'"(https://[^"]*\.mp3)"', raw_html)
    mp3_url = mp3_m.group(1) if mp3_m else None

    wsw_idx = raw_html.find('class="wsw"')
    tail = raw_html[wsw_idx:] if wsw_idx != -1 else raw_html
    glossary_idx = tail.find("Words in This Story")
    body_html = tail[:glossary_idx] if glossary_idx != -1 else tail

    paragraphs = []
    for p in re.findall(r"<p>(.*?)</p>", body_html, re.S):
        text = htmlmod.unescape(re.sub(r"<[^>]+>", "", p)).strip()
        text = re.sub(r"\s+", " ", text)
        if text and re.search(r"[A-Za-z]", text):
            paragraphs.append(text)

    return title, mp3_url, "\n\n".join(paragraphs)


def load_vocab_levels():
    """lemma (lowercase) -> CEFR level, from the already-seeded vocab spine."""
    levels = {}
    with open(VOCAB_SEED, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            rec = json.loads(line)
            levels[rec["lemma"].lower()] = rec["cefr_level"]
    return levels


def estimate_cefr_level(body, vocab_levels):
    """Heuristic, no LLM: tokenize, look up each content word's level in the
    vocab spine, take the 85th-percentile level among matches. Falls back to
    B1 (this whole VOA series targets intermediate learners) if too few
    words match to say anything."""
    words = re.findall(r"[a-zA-Z']+", body.lower())
    matched = [vocab_levels[w] for w in words if w in vocab_levels]
    if len(matched) < 10:
        return "B1"
    counts = Counter(matched)
    cumulative = 0
    threshold = 0.85 * len(matched)
    for level in CEFR_ORDER:
        cumulative += counts.get(level, 0)
        if cumulative >= threshold:
            return level
    return "B2"


def slugify(title):
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return s


def upload_audio(s3, slug, audio_bytes):
    object_key = f"voa/words-and-their-stories/{slug}.mp3"
    s3.put_object(Bucket=BUCKET, Key=object_key, Body=audio_bytes, ContentType="audio/mpeg")
    return object_key


def main():
    s3 = boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",
    )

    vocab_levels = load_vocab_levels()
    stats = {"fetched": 0, "skipped_incomplete": 0}

    with open(OUT, "w", encoding="utf-8") as out:
        for slug_path in ARTICLES:
            url = BASE + slug_path
            raw = fetch(url).decode("utf-8", errors="ignore")
            title, mp3_url, body = extract_article(raw)
            if not title or not mp3_url or not body:
                stats["skipped_incomplete"] += 1
                print(f"SKIP (incomplete) {url}")
                continue

            slug = slugify(title)
            audio_bytes = fetch(mp3_url)
            object_key = upload_audio(s3, slug, audio_bytes)
            cefr_level = estimate_cefr_level(body, vocab_levels)

            row = {
                "title": title,
                "body": body,
                "cefr_level": cefr_level,
                "topic_tags": TOPIC_TAGS,
                "is_generated": False,
                "source": SOURCE,
                "license": LICENSE,
                "media": {
                    "object_key": object_key,
                    "mime": "audio/mpeg",
                    "duration_ms": None,
                    "transcript": body,
                    "alignment": None,
                    "source": SOURCE,
                    "license": LICENSE,
                },
            }
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
            stats["fetched"] += 1
            print(f"OK  [{cefr_level}] {title} ({len(audio_bytes)} bytes -> {object_key})")

    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()

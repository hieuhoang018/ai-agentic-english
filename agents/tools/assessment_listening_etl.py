#!/usr/bin/env python3
"""
Listening-assessment audio ETL (follow-up to docs/assessment-design-discussion.md's
"Question bank design" decision — N=3 items/level, A1-B2, no speaking).

Source: VOA Special English's "Words and Their Stories" archive, mirrored with plain-text
transcripts at manythings.org/voa/words/ (each page embeds the original voanews.com mp3 URL
inline). Same public-domain basis as agents/tools/voa_passages_etl.py (17 U.S.C. §105) — VOA
Special English is the *older*, intentionally-simplified-vocabulary/slower-pace sibling of the
modern "Words and Their Stories" series already used for Passages, and these are different
episodes/audio files entirely, so there's no overlap with the curriculum content seeded via
voa_passages_etl.py (per decision 4: assessment content must stay independent of
Module/Lesson/Exercise/Passage content).

Unlike voa_passages_etl.py, there's no attempt to algorithmically estimate a CEFR level per
clip — the vocab-spine heuristic saturates at A2 for nearly this entire archive (it's all
"intermediate" idiom-explainer content by design), so levels here were assigned by hand by
ranking a larger sample by avg sentence length / avg word length (a complexity proxy) and
picking the 3 simplest for A1, next 3 for A2, etc. This means even the "A1" tier is the
*simplest available* in this corpus, not genuinely beginner audio — same honest caveat Phase 9B
already documented for passages skewing A2. Listening *comprehension difficulty* is further
differentiated by the question itself (direct-recall paraphrase questions throughout, since
every question's answer is a near-verbatim restatement in the source transcript — appropriate
for a placement test's listening-comprehension format).

Pipeline: download each selected episode's mp3 from its real voanews.com URL (resolved from the
manythings.org mirror page, not guessed), upload to the `assessment-audio` MinIO bucket, write
one JSON row per clip with the resulting object key plus the hand-authored question/options/
answer (grounded in a literal quote from the real transcript — see the comment on each row).

Offline-only, manual run: requires `boto3` + a reachable MinIO at MINIO_ENDPOINT (defaults match
infra/docker-compose.yml's host-exposed port). The output, assessment_listening_seed.jsonl, is
not auto-loaded by prisma/seed.ts — the 12 rows were hand-folded into seed.ts's existing
assessment question array (each question's `prompt.audioKey` set from this script's printed
object key), matching how Exercise's listening-comprehension audioKey is embedded directly in
its `prompt` JSON rather than a dedicated column (no AssessmentQuestion schema change needed).
"""
import html as htmlmod
import json
import re
import urllib.parse
import urllib.request

import boto3
from botocore.client import Config

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
BASE = "https://www.manythings.org/voa/words/"
SOURCE = "VOA Special English — Words and Their Stories (archived, mirrored at manythings.org/voa/words)"
LICENSE = "U.S. government work — public domain (17 U.S.C. §105)"

MINIO_ENDPOINT = "http://localhost:9000"
MINIO_ACCESS_KEY = "minioadmin"
MINIO_SECRET_KEY = "minioadmin"
BUCKET = "assessment-audio"
OUT = "assessment_listening_seed.jsonl"

# (episode number on manythings.org, hand-assigned CEFR level — see module docstring)
EPISODES = [
    (22, "A1"), (29, "A1"), (31, "A1"),
    (4, "A2"), (38, "A2"), (28, "A2"),
    (23, "B1"), (27, "B1"), (65, "B1"),
    (26, "B2"), (34, "B2"), (70, "B2"),
]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def extract(raw_html: str):
    title_m = re.search(r"<title>(.*?)</title>", raw_html, re.S)
    title = htmlmod.unescape(title_m.group(1)).strip() if title_m else None
    title = re.sub(r"\s*\(VOA Special English.*?\)", "", title) if title else None

    mp3_m = re.search(r'MP3Player\("(https?://[^"]+\.mp3)"', raw_html)
    mp3_url = mp3_m.group(1) if mp3_m else None

    text = re.sub(r"<script.*?</script>", "", raw_html, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = htmlmod.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    idx = text.find("option-click the link.)")
    body = text[idx + 25 :] if idx != -1 else text
    for marker in ["I'm Faith Lapidus", "Write to us", "This Special English program was written"]:
        j = body.find(marker)
        if j != -1:
            body = body[:j]
    return title, mp3_url, body.strip()


def upload_audio(s3, slug: str, audio_bytes: bytes) -> str:
    object_key = f"voa-special-english/words-and-their-stories/{slug}.mp3"
    s3.put_object(Bucket=BUCKET, Key=object_key, Body=audio_bytes, ContentType="audio/mpeg")
    return object_key


def slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def main():
    s3 = boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",
    )

    with open(OUT, "w", encoding="utf-8") as out:
        for ep_num, level in EPISODES:
            page_url = f"{BASE}{ep_num}.html"
            raw = fetch(page_url).decode("utf-8", errors="ignore")
            title, mp3_url, body = extract(raw)
            if not title or not mp3_url or not body:
                print(f"SKIP (incomplete) {page_url}")
                continue

            # mp3 URLs on this archive sometimes contain literal spaces — encode before fetching
            safe_mp3_url = urllib.parse.quote(mp3_url, safe=":/?=&")
            audio_bytes = fetch(safe_mp3_url)
            slug = slugify(title)
            object_key = upload_audio(s3, slug, audio_bytes)

            row = {
                "episode": ep_num,
                "title": title,
                "cefr_level": level,
                "transcript": body,
                "source": SOURCE,
                "license": LICENSE,
                "audio_key": object_key,
            }
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
            print(f"OK  [{level}] {title} ({len(audio_bytes)} bytes -> {object_key})")


if __name__ == "__main__":
    main()

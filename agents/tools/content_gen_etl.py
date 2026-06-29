#!/usr/bin/env python3
"""
Phase C exercise-generation ETL (Layer 2 of docs/learning-materials-content-roadmap.md).

Replaces (additively — upserts by id, never deletes) the 27 hand-written
prisma/seed.ts exercises with LLM-generated Module/Lesson/Exercise content,
grounded on the Phase 0/A/B primitives (vocab, grammar, passages) already
seeded in learning-materials-service.

Generation unit is the ATOMIC EXERCISE, not the module. Each LLM call is
scoped to exactly one grounding primitive (one passage, or one grammar
point) — never a basket of unrelated vocab/grammar forced into one
artificial narrative. An earlier version of this script asked the model to
invent a whole module/lesson hierarchy in a single call; in practice this
produced incoherent sentences when the model was told to "naturally weave
in" 25 unrelated vocabulary words into one lesson (e.g. forcing "wardrobe",
"social networking", and "artist" into the same sentence). Keeping each
call atomic fixed that: every generated exercise is coherent on its own
because it only has one thing to be about.

Module/Lesson grouping is then DETERMINISTIC, not model-driven — same
philosophy as agt02_learning_path/optimizer.select_daily_activities being
deterministic rather than LLM-driven sequencing:
  - Reading: one lesson per passage (the passage itself is the natural
    grouping unit), one module per CEFR level.
  - Writing: exercises are generated per grammar point, then chunked into
    fixed-size lessons in the order grammar points were fetched.

Every generated exercise also carries a `grounded_on` field (passage id/
title, or grammar point id/title) purely for human-review traceability —
the roadmap explicitly calls out keeping this in the JSONL rather than
building a formal join table ("only add a real join table if something
downstream needs to query it"). prisma/seedGeneratedContent.ts ignores
unknown fields, so this is safe to carry through without a loader change.

This script is NOT one of the 11 numbered agents (AGT01-11) — same
tools-only, non-service status as voa_passages_etl.py. CONTENT_GEN exists
purely as a dispatch key in the LLM router, not a new agent.

Usage — run from the repo root so `agents.shared` resolves:
    python -m agents.tools.content_gen_etl

Requires:
  - learning-materials-service reachable at LM_SERVICE_BASE_URL with Phase
    0/A/B primitives already seeded (vocab/grammar/passages).
  - INFERENCE_MODE=live and OPENROUTER_API_KEY set (see agents/shared/config.py).
    CONTENT_GEN is wired to openai/gpt-oss-20b:free (router.py) — a reasoning
    model that spends tokens on an internal `reasoning` field before the
    final `content`, so calls use a generous max_tokens budget.

Output: generated_content_seed.jsonl, written to the current directory (same
convention as prisma/etl/vocab_etl.py and grammar_etl.py). After human review
(git diff for CEFR-accuracy and answer-key correctness), copy it to
services/learning-materials-service/prisma/seed-data/generated_content_seed.jsonl
and run `npm run seed:generated`. Re-run this script on demand for more
batches (new levels/topics/skills, or just raise the *_LIMIT constants below
for a bigger batch) — accumulates rather than replaces, same as every other
primitive loader.
"""
from __future__ import annotations

import asyncio
import json
import os
import re

import httpx

from agents.shared.llm.router import AgentID, call_llm

LM_SERVICE_BASE_URL = os.environ.get("LM_SERVICE_BASE_URL", "http://localhost:4002")
LM_INTERNAL_SECRET = os.environ.get("LM_INTERNAL_SECRET", "dev-internal-secret")

OUT = "generated_content_seed.jsonl"

ALLOWED_TYPES = {"mcq", "fill-blank", "sentence-correction", "listening-comprehension"}
ALLOWED_DIFFICULTIES = {"easy", "medium", "hard"}

MAX_TOKENS = 8000  # generous — gpt-oss-20b spends real tokens on internal reasoning first

# First batch (Phase C pilot) — small and focused, mirroring Phase B's
# "prove the pipeline first" approach. Raise *_limit / exercises_per_* to
# scale up a re-run; module ids stay the same so re-runs accumulate/update
# in place rather than creating duplicate modules.
# Passage allocation across all reading + listening batches (26 A2 passages total, 0-indexed):
#   Reading  batch 1: indices  0- 2  (offset=0,  limit=3)
#   Listening batch 1: indices  3- 5  (offset=3,  limit=3)
#   Reading  batch 2: indices  6- 8  (offset=6,  limit=3)
#   Reading  batch 3: indices  9-11  (offset=9,  limit=3)
#   Listening batch 2: indices 12-14  (offset=12, limit=3)
#   Listening batch 3: indices 15-17  (offset=15, limit=3)
# Indices 18-25 remain available for future batches.
READING_BATCHES = [
    {
        "module_id": "mod-gen-reading-a2",
        "title": "Reading Practice (Generated)",
        "description": (
            "LLM-generated reading comprehension drills, one lesson per VOA "
            "Learning English passage."
        ),
        "skill": "reading",
        "cefr_level": "A2",
        "order": 4,
        "passages_offset": 0,
        "passages_limit": 3,
        "exercises_per_passage": 5,
    },
    {
        "module_id": "mod-gen-reading-a2-2",
        "title": "Reading Practice 2 (Generated)",
        "description": (
            "LLM-generated reading comprehension drills, second batch of VOA "
            "Learning English passages."
        ),
        "skill": "reading",
        "cefr_level": "A2",
        "order": 7,
        "passages_offset": 6,
        "passages_limit": 3,
        "exercises_per_passage": 5,
    },
    {
        "module_id": "mod-gen-reading-a2-3",
        "title": "Reading Practice 3 (Generated)",
        "description": (
            "LLM-generated reading comprehension drills, third batch of VOA "
            "Learning English passages."
        ),
        "skill": "reading",
        "cefr_level": "A2",
        "order": 8,
        "passages_offset": 9,
        "passages_limit": 3,
        "exercises_per_passage": 5,
    },
]

LISTENING_BATCHES = [
    {
        "module_id": "mod-gen-listening-a2",
        "title": "Listening Practice (Generated)",
        "description": (
            "LLM-generated listening comprehension drills, one lesson per VOA "
            "Learning English passage, with the matching audio file."
        ),
        "skill": "listening",
        "cefr_level": "A2",
        "order": 6,
        # Offset past the reading batch's passages_limit (3) so the two skills
        # draw from different passages out of the pool — avoids a learner
        # seeing the exact same passage twice across reading and listening.
        "passages_offset": 3,
        "passages_limit": 3,
        "exercises_per_passage": 5,
    },
    {
        "module_id": "mod-gen-listening-a2-2",
        "title": "Listening Practice 2 (Generated)",
        "description": (
            "LLM-generated listening comprehension drills, second batch of VOA "
            "Learning English passages, with matching audio files."
        ),
        "skill": "listening",
        "cefr_level": "A2",
        "order": 9,
        "passages_offset": 12,
        "passages_limit": 3,
        "exercises_per_passage": 5,
    },
    {
        "module_id": "mod-gen-listening-a2-3",
        "title": "Listening Practice 3 (Generated)",
        "description": (
            "LLM-generated listening comprehension drills, third batch of VOA "
            "Learning English passages, with matching audio files."
        ),
        "skill": "listening",
        "cefr_level": "A2",
        "order": 10,
        "passages_offset": 15,
        "passages_limit": 3,
        "exercises_per_passage": 5,
    },
]

# Writing batches use different CEFR levels so each batch draws from a distinct
# grammar-point pool (the fetch has no offset param — level is the differentiator).
WRITING_BATCHES = [
    {
        "module_id": "mod-gen-writing-b1",
        "title": "Writing Practice (Generated)",
        "description": (
            "LLM-generated sentence-correction and fill-in-the-blank drills, "
            "each grounded on one B1 grammar point."
        ),
        "skill": "writing",
        "cefr_level": "B1",
        "order": 5,
        "grammar_limit": 8,
        "exercises_per_grammar_point": 2,
        "exercises_per_lesson": 5,
        "exercise_types": ["fill-blank", "sentence-correction"],
    },
    {
        "module_id": "mod-gen-writing-a2",
        "title": "Writing Practice — A2 (Generated)",
        "description": (
            "LLM-generated writing drills grounded on A2-level grammar points."
        ),
        "skill": "writing",
        "cefr_level": "A2",
        "order": 11,
        "grammar_limit": 8,
        "exercises_per_grammar_point": 2,
        "exercises_per_lesson": 5,
        "exercise_types": ["fill-blank", "sentence-correction"],
    },
    {
        "module_id": "mod-gen-writing-b2",
        "title": "Writing Practice — B2 (Generated)",
        "description": (
            "LLM-generated writing drills grounded on B2-level grammar points."
        ),
        "skill": "writing",
        "cefr_level": "B2",
        "order": 12,
        "grammar_limit": 8,
        "exercises_per_grammar_point": 2,
        "exercises_per_lesson": 5,
        "exercise_types": ["fill-blank", "sentence-correction"],
    },
]


async def _fetch_passages(client: httpx.AsyncClient, cefr_level: str, offset: int, limit: int) -> list[dict]:
    # /internal/passages has no offset/skip param, so over-fetch and slice
    # client-side — this is how reading and listening batches are kept on
    # non-overlapping passages out of the same pool (see passages_offset in
    # READING_BATCHES/LISTENING_BATCHES above).
    resp = await client.get(
        f"{LM_SERVICE_BASE_URL}/internal/passages",
        params={"cefrLevel": cefr_level, "limit": offset + limit},
        headers={"x-internal-secret": LM_INTERNAL_SECRET},
    )
    resp.raise_for_status()
    return resp.json()[offset:offset + limit]


async def _fetch_grammar_points(client: httpx.AsyncClient, cefr_level: str, limit: int) -> list[dict]:
    resp = await client.get(
        f"{LM_SERVICE_BASE_URL}/internal/grammar",
        params={"cefrLevel": cefr_level, "limit": limit * 3},  # over-fetch, then filter
        headers={"x-internal-secret": LM_INTERNAL_SECRET},
    )
    resp.raise_for_status()
    points = resp.json()
    # Prefer points with a real example sentence to drill — falls back to all
    # if too few qualify (Phase A's ETL kept ~102 example-less construct names).
    with_examples = [g for g in points if g.get("examples")]
    pool = with_examples if len(with_examples) >= limit else points
    return pool[:limit]


def _extract_json(text: str) -> dict:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    return json.loads(cleaned)


def _validate_exercises(raw_exercises: list, allowed_types: set[str], skill: str) -> list[dict]:
    valid = []
    for ex in raw_exercises:
        ex_type = ex.get("type")
        answer_key = ex.get("answer_key")
        difficulty = ex.get("difficulty") if ex.get("difficulty") in ALLOWED_DIFFICULTIES else "medium"

        if ex_type not in ALLOWED_TYPES or ex_type not in allowed_types:
            print(f"SKIP exercise: invalid/unexpected type {ex_type!r}")
            continue
        if not isinstance(answer_key, dict) or "answer" not in answer_key:
            print(f"SKIP exercise: missing answer_key.answer")
            continue

        valid.append({
            "type": ex_type,
            "prompt": ex.get("prompt", {}),
            "answer_key": answer_key,
            "difficulty": difficulty,
            "skill": skill,
        })
    return valid


async def _generate_reading_exercises(client: httpx.AsyncClient, passage: dict, cefr_level: str, n: int) -> list[dict]:
    instructions = f"""Generate exactly {n} multiple-choice (mcq) reading-comprehension exercises for CEFR level {cefr_level}, based ONLY on the passage below. Every question and its 4 options must be answerable directly from this text — do not introduce outside facts.

PASSAGE: "{passage['title']}"
{passage['body']}

Respond with ONLY a JSON object (no markdown fences, no commentary):
{{
  "exercises": [
    {{
      "type": "mcq",
      "prompt": {{"passage": "a short relevant excerpt from above", "question": "...", "options": ["...", "...", "...", "..."]}},
      "answer_key": {{"answer": "the exact text of the correct option"}},
      "difficulty": "easy|medium|hard"
    }}
  ]
}}
"""
    raw = await call_llm(
        [{"role": "user", "content": instructions}],
        agent_id=AgentID.CONTENT_GEN,
        temperature=0.7,
        max_tokens=MAX_TOKENS,
    )
    try:
        parsed = _extract_json(raw)
    except json.JSONDecodeError as exc:
        print(f"SKIP passage {passage['id']}: could not parse LLM JSON output ({exc})")
        return []

    exercises = _validate_exercises(parsed.get("exercises", []), {"mcq"}, "reading")
    for ex in exercises:
        ex["grounded_on"] = {"type": "passage", "id": passage["id"], "title": passage["title"]}
    return exercises


async def _generate_listening_exercises(client: httpx.AsyncClient, passage: dict, cefr_level: str, n: int) -> list[dict]:
    instructions = f"""Generate exactly {n} multiple-choice (listening-comprehension) exercises for CEFR level {cefr_level}, based ONLY on the transcript below. Every question and its 4 options must be answerable directly from this transcript — do not introduce outside facts.

TRANSCRIPT: "{passage['title']}"
{passage['body']}

Respond with ONLY a JSON object (no markdown fences, no commentary):
{{
  "exercises": [
    {{
      "type": "listening-comprehension",
      "prompt": {{"transcript": "a short relevant excerpt from above", "question": "...", "options": ["...", "...", "...", "..."]}},
      "answer_key": {{"answer": "the exact text of the correct option"}},
      "difficulty": "easy|medium|hard"
    }}
  ]
}}
"""
    raw = await call_llm(
        [{"role": "user", "content": instructions}],
        agent_id=AgentID.CONTENT_GEN,
        temperature=0.7,
        max_tokens=MAX_TOKENS,
    )
    try:
        parsed = _extract_json(raw)
    except json.JSONDecodeError as exc:
        print(f"SKIP passage {passage['id']}: could not parse LLM JSON output ({exc})")
        return []

    exercises = _validate_exercises(parsed.get("exercises", []), {"listening-comprehension"}, "listening")
    for ex in exercises:
        ex["grounded_on"] = {"type": "passage", "id": passage["id"], "title": passage["title"]}
        # Real audioKey/audioBucket from the passage's linked MediaAsset, not LLM output —
        # the model never sees or invents these, so they can't be hallucinated or mismatched.
        ex["prompt"]["audioKey"] = passage.get("audioKey")
        ex["prompt"]["audioBucket"] = "passage-audio" if passage.get("audioKey") else None
    return exercises


async def _generate_writing_exercises(
    client: httpx.AsyncClient, grammar_point: dict, cefr_level: str, allowed_types: list[str], n: int
) -> list[dict]:
    example = grammar_point["examples"][0]["sentence"] if grammar_point.get("examples") else None
    example_line = f'Reference example: "{example}"' if example else "(no reference example — write your own correct example sentence for this construct)"

    instructions = f"""Generate exactly {n} writing exercises for CEFR level {cefr_level} that drill ONE specific grammar point and nothing else: "{grammar_point['title']}" (category: {grammar_point['category']}).
{example_line}

Allowed exercise types: {', '.join(allowed_types)}.
- "fill-blank": prompt.sentence must contain a literal blank "______", prompt.instruction explains the task, answer_key.answer is the word/phrase that fills it.
- "sentence-correction": prompt.sentence is a complete sentence containing exactly one grammatical error related to this construct, prompt.instruction is "Find and correct the error.", answer_key.answer is the fully corrected sentence.

Every sentence must be a natural, complete, self-contained sentence about this grammar point only — do not force in unrelated vocabulary or topics.

Respond with ONLY a JSON object (no markdown fences, no commentary):
{{
  "exercises": [
    {{
      "type": "fill-blank or sentence-correction",
      "prompt": {{ ... }},
      "answer_key": {{"answer": "..."}},
      "difficulty": "easy|medium|hard"
    }}
  ]
}}
"""
    raw = await call_llm(
        [{"role": "user", "content": instructions}],
        agent_id=AgentID.CONTENT_GEN,
        temperature=0.7,
        max_tokens=MAX_TOKENS,
    )
    try:
        parsed = _extract_json(raw)
    except json.JSONDecodeError as exc:
        print(f"SKIP grammar point {grammar_point['id']}: could not parse LLM JSON output ({exc})")
        return []

    exercises = _validate_exercises(parsed.get("exercises", []), set(allowed_types), "writing")
    for ex in exercises:
        ex["grounded_on"] = {"type": "grammar_point", "id": grammar_point["id"], "title": grammar_point["title"]}
    return exercises


def _assign_ids(module_id: str, lessons: list[dict]) -> list[dict]:
    out = []
    for li, lesson in enumerate(lessons, start=1):
        lesson_id = f"{module_id}-l{li}"
        exercises_out = []
        for ei, ex in enumerate(lesson["exercises"], start=1):
            ex_with_id = {"id": f"{lesson_id}-e{ei}", **ex}
            exercises_out.append(ex_with_id)
        out.append({
            "id": lesson_id,
            "title": lesson["title"],
            "content": lesson["content"],
            "order": li,
            "exercises": exercises_out,
        })
    return out


async def _build_reading_module(client: httpx.AsyncClient, batch: dict) -> dict | None:
    passages = await _fetch_passages(client, batch["cefr_level"], batch["passages_offset"], batch["passages_limit"])
    if not passages:
        print(f"SKIP module {batch['module_id']}: no passages available for {batch['cefr_level']}")
        return None

    lessons = []
    for passage in passages:
        exercises = await _generate_reading_exercises(client, passage, batch["cefr_level"], batch["exercises_per_passage"])
        if not exercises:
            continue
        lessons.append({
            "title": passage["title"],
            "content": {"introduction": f'Read "{passage["title"]}" and answer the questions.'},
            "exercises": exercises,
        })
        print(f"OK  passage \"{passage['title']}\" -> {len(exercises)} exercises")

    if not lessons:
        print(f"SKIP module {batch['module_id']}: no lessons generated")
        return None

    return {
        "id": batch["module_id"],
        "title": batch["title"],
        "description": batch["description"],
        "cefr_level": batch["cefr_level"],
        "skill_focus": batch["skill"],
        "order": batch["order"],
        "lessons": _assign_ids(batch["module_id"], lessons),
    }


async def _build_listening_module(client: httpx.AsyncClient, batch: dict) -> dict | None:
    passages = await _fetch_passages(client, batch["cefr_level"], batch["passages_offset"], batch["passages_limit"])
    if not passages:
        print(f"SKIP module {batch['module_id']}: no passages available for {batch['cefr_level']}")
        return None

    lessons = []
    for passage in passages:
        if not passage.get("audioKey"):
            print(f"SKIP passage \"{passage['title']}\": no linked audio, can't generate a listening exercise")
            continue
        exercises = await _generate_listening_exercises(client, passage, batch["cefr_level"], batch["exercises_per_passage"])
        if not exercises:
            continue
        lessons.append({
            "title": passage["title"],
            "content": {"introduction": f'Listen to "{passage["title"]}" and answer the questions.'},
            "exercises": exercises,
        })
        print(f"OK  passage \"{passage['title']}\" -> {len(exercises)} exercises (audioKey: {passage['audioKey']})")

    if not lessons:
        print(f"SKIP module {batch['module_id']}: no lessons generated")
        return None

    return {
        "id": batch["module_id"],
        "title": batch["title"],
        "description": batch["description"],
        "cefr_level": batch["cefr_level"],
        "skill_focus": batch["skill"],
        "order": batch["order"],
        "lessons": _assign_ids(batch["module_id"], lessons),
    }


async def _build_writing_module(client: httpx.AsyncClient, batch: dict) -> dict | None:
    grammar_points = await _fetch_grammar_points(client, batch["cefr_level"], batch["grammar_limit"])
    if not grammar_points:
        print(f"SKIP module {batch['module_id']}: no grammar points available for {batch['cefr_level']}")
        return None

    flat_exercises = []
    for gp in grammar_points:
        exercises = await _generate_writing_exercises(
            client, gp, batch["cefr_level"], batch["exercise_types"], batch["exercises_per_grammar_point"]
        )
        flat_exercises.extend(exercises)
        print(f"OK  grammar point \"{gp['title']}\" -> {len(exercises)} exercises")

    if not flat_exercises:
        print(f"SKIP module {batch['module_id']}: no exercises generated")
        return None

    # Deterministic grouping: chunk the flat pool into fixed-size lessons in
    # fetch order. No LLM involved in this step.
    size = batch["exercises_per_lesson"]
    chunks = [flat_exercises[i:i + size] for i in range(0, len(flat_exercises), size)]

    lessons = []
    for chunk in chunks:
        titles = list(dict.fromkeys(ex["grounded_on"]["title"] for ex in chunk))
        lesson_title = "Grammar Practice: " + ", ".join(titles[:3]) if len(titles) <= 3 else "Grammar Practice (Mixed)"
        lessons.append({
            "title": lesson_title,
            "content": {"introduction": "Practice the grammar points covered in this lesson."},
            "exercises": chunk,
        })

    return {
        "id": batch["module_id"],
        "title": batch["title"],
        "description": batch["description"],
        "cefr_level": batch["cefr_level"],
        "skill_focus": batch["skill"],
        "order": batch["order"],
        "lessons": _assign_ids(batch["module_id"], lessons),
    }


async def main() -> None:
    stats = {"modules": 0, "lessons": 0, "exercises": 0, "skipped_modules": 0}

    async with httpx.AsyncClient(timeout=60.0) as client:
        with open(OUT, "w", encoding="utf-8") as out:
            for batch in READING_BATCHES:
                record = await _build_reading_module(client, batch)
                if record is None:
                    stats["skipped_modules"] += 1
                    continue
                out.write(json.dumps(record, ensure_ascii=False) + "\n")
                stats["modules"] += 1
                stats["lessons"] += len(record["lessons"])
                stats["exercises"] += sum(len(l["exercises"]) for l in record["lessons"])

            for batch in LISTENING_BATCHES:
                record = await _build_listening_module(client, batch)
                if record is None:
                    stats["skipped_modules"] += 1
                    continue
                out.write(json.dumps(record, ensure_ascii=False) + "\n")
                stats["modules"] += 1
                stats["lessons"] += len(record["lessons"])
                stats["exercises"] += sum(len(l["exercises"]) for l in record["lessons"])

            for batch in WRITING_BATCHES:
                record = await _build_writing_module(client, batch)
                if record is None:
                    stats["skipped_modules"] += 1
                    continue
                out.write(json.dumps(record, ensure_ascii=False) + "\n")
                stats["modules"] += 1
                stats["lessons"] += len(record["lessons"])
                stats["exercises"] += sum(len(l["exercises"]) for l in record["lessons"])

    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    asyncio.run(main())

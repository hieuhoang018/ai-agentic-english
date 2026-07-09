#!/usr/bin/env python3
"""
Seeds realistic rows into postgres-agents for the synthetic perf-test users
(perf-user-0000..NNNN, matching perf/generate-tokens.mjs's deterministic
clerkUserId scheme). Without this, endpoints like /api/review-center and
/api/schedule/due return near-empty payloads for a load test - real DB query
cost and payload size are understated. See perf/README.md.

Writes directly to postgres-agents via asyncpg (bypassing the service APIs -
this is a one-off local perf-test tool, not app code). Safe to re-run: does
a scoped DELETE on `clerk_user_id LIKE 'perf-user-%'` first, so it never
touches real user data and each run leaves a clean, reproducible dataset.

Usage (run with the repo's .venv, per project convention):
    .venv/bin/python perf/seed_perf_users.py [count]
    .venv/bin/python perf/seed_perf_users.py 20

Requires the perf-user-NNNN IDs to already have tokens (node
perf/generate-tokens.mjs <count>) - this script doesn't read tokens.csv,
just regenerates the same deterministic ID scheme, so run with a matching
count.
"""
import asyncio
import json
import random
import sys
from datetime import datetime, timedelta, timezone

import asyncpg

DATABASE_URL = "postgresql://postgres:postgres@localhost:5438/agent_ltm"

SKILLS = ["LISTENING", "SPEAKING", "READING", "WRITING"]
ERROR_TYPES = ["subject_verb_agreement", "article_misuse", "preposition_error", "tense_error", "word_order"]
VOCAB_WORDS = [
    "ubiquitous", "meticulous", "resilience", "candid", "eloquent", "ambiguous", "pragmatic",
    "scrutinize", "arbitrary", "coherent", "diligent", "nuance", "perceive", "reluctant",
    "substantiate", "tentative", "viable", "articulate", "coincide", "discrepancy", "elicit",
    "feasible", "hypothesis", "implicit", "inevitable", "notion", "plausible", "rigorous",
    "subsequent", "underlying",
]


def clerk_user_id(i: int) -> str:
    return f"perf-user-{i:04d}"


async def clear_existing(conn: asyncpg.Connection) -> None:
    # Scoped to the perf-user-% prefix, exclusive to this tool - never
    # touches real data. child tables first (error_events/conversation_archive
    # cascade from learning_sessions anyway, but being explicit is cheap).
    for table in ["error_events", "conversation_archive", "learning_sessions",
                   "vocabulary_mastery", "agent_learning_plans", "learner_profiles"]:
        await conn.execute(f"DELETE FROM {table} WHERE clerk_user_id LIKE 'perf-user-%'")


async def seed_user(conn: asyncpg.Connection, cid: str) -> None:
    now = datetime.now(timezone.utc)

    await conn.execute(
        """
        INSERT INTO learner_profiles
            (clerk_user_id, irt_theta, cold_start_flag, goal_profile)
        VALUES ($1, $2, FALSE, $3)
        """,
        cid,
        json.dumps({"L": round(random.uniform(-1, 1.5), 2), "S": None,
                    "R": round(random.uniform(-1, 1.5), 2), "W": round(random.uniform(-1, 1.5), 2)}),
        json.dumps({"goals": ["conversation"]}),
    )

    session_ids = []
    for i in range(5):
        skill = SKILLS[i % len(SKILLS)]
        start = now - timedelta(days=(5 - i) * 2, minutes=random.randint(0, 600))
        end = start + timedelta(minutes=random.randint(8, 25))
        session_id = await conn.fetchval(
            """
            INSERT INTO learning_sessions
                (clerk_user_id, start_time, end_time, skill_focus, summary_metrics)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING session_id
            """,
            cid, start, end, skill, json.dumps({"turns": random.randint(4, 12)}),
        )
        session_ids.append((session_id, skill, start))

        for _ in range(random.randint(1, 3)):
            await conn.execute(
                """
                INSERT INTO error_events
                    (session_id, clerk_user_id, error_type, skill_domain, severity, context_excerpt, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                session_id, cid, random.choice(ERROR_TYPES), skill,
                random.randint(1, 3), "I have went to the store yesterday.", start,
            )

    for session_id, skill, start in session_ids:
        if skill == "SPEAKING":
            await conn.execute(
                """
                INSERT INTO conversation_archive (session_id, clerk_user_id, transcript, created_at)
                VALUES ($1, $2, $3, $4)
                """,
                session_id, cid,
                json.dumps([
                    {"role": "user", "text": "I want to practice talking about my job."},
                    {"role": "assistant", "text": "Great! Tell me about what you do."},
                    {"role": "user", "text": "I am work in a software company as engineer."},
                ]),
                start,
            )

    words = random.sample(VOCAB_WORDS, k=min(15, len(VOCAB_WORDS)))
    for idx, word in enumerate(words):
        # Half the words are "due" (old last_encounter, low retrievability),
        # half are fresh (recent encounter, high retrievability) - so
        # /api/schedule/due returns a real, non-trivial, non-total list.
        due = idx % 2 == 0
        last_encounter = now - timedelta(days=random.randint(20, 60) if due else random.randint(0, 2))
        retrievability = round(random.uniform(0.1, 0.4), 3) if due else round(random.uniform(0.7, 0.99), 3)
        await conn.execute(
            """
            INSERT INTO vocabulary_mastery
                (clerk_user_id, word, sm_retrievability, last_encounter, encounter_count, context_sentences)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (clerk_user_id, word) DO NOTHING
            """,
            cid, word, retrievability, last_encounter, random.randint(1, 8),
            [f"The report was {word} in its analysis."],
        )

    await conn.execute(
        """
        INSERT INTO agent_learning_plans
            (clerk_user_id, lm_plan_id, skill_allocation, activity_queue, rationale, is_active)
        VALUES ($1, $2, $3, $4, $5, TRUE)
        """,
        cid, f"perf-seed-plan-{cid}",
        json.dumps({"SPEAKING": 0.4, "READING": 0.3, "LISTENING": 0.2, "WRITING": 0.1}),
        json.dumps([{"type": "exercise", "id": "perf-seed-exercise-1"}]),
        "Seeded for perf testing - not a real AGT-02 rationale.",
    )


async def main() -> None:
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await clear_existing(conn)
        for i in range(count):
            await seed_user(conn, clerk_user_id(i))
        print(f"Seeded {count} perf users (perf-user-0000..{count - 1:04d}) into postgres-agents.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())

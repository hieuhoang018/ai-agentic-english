"""
Long-Term Memory (LTM) reads and writes against the agent_ltm PostgreSQL database.
All queries use asyncpg directly — no ORM.
clerk_user_id is the universal cross-service user key throughout.
"""

import json
from datetime import datetime, timezone
from agents.shared.db.postgres import fetchrow, fetch, execute


_ALLOWED_PROFILE_FIELDS: frozenset[str] = frozenset({
    "skill_scores",
    "error_patterns",
    "behavioral_profile",
    "vocab_mastery",
    "total_sessions",
    "last_session_at",
})


def _vec_to_str(v: list[float]) -> str:
    """Convert a list of floats to pgvector format without spaces."""
    return "[" + ",".join(str(x) for x in v) + "]"


# ── learner_profiles ────────────────────────────────────────────────────────

async def get_profile(clerk_user_id: str) -> dict | None:
    row = await fetchrow(
        "SELECT * FROM learner_profiles WHERE clerk_user_id = $1",
        clerk_user_id,
    )
    if not row:
        return None
    return dict(row)


async def create_profile(clerk_user_id: str) -> dict:
    row = await fetchrow(
        """
        INSERT INTO learner_profiles (clerk_user_id)
        VALUES ($1)
        ON CONFLICT (clerk_user_id) DO UPDATE
            SET updated_at = NOW()
        RETURNING *
        """,
        clerk_user_id,
    )
    return dict(row)


async def update_profile(clerk_user_id: str, fields: dict) -> dict | None:
    """
    Partial update of learner_profiles.
    Only updates fields present in the dict; always sets updated_at.
    """
    invalid = set(fields.keys()) - _ALLOWED_PROFILE_FIELDS
    if invalid:
        raise ValueError(f"update_profile: disallowed fields: {invalid}")

    set_clauses = []
    values = []
    idx = 1
    for key, val in fields.items():
        if isinstance(val, dict):
            val = json.dumps(val)
        set_clauses.append(f"{key} = ${idx}")
        values.append(val)
        idx += 1
    set_clauses.append(f"updated_at = NOW()")
    values.append(clerk_user_id)
    query = f"""
        UPDATE learner_profiles
        SET {", ".join(set_clauses)}
        WHERE clerk_user_id = ${idx}
        RETURNING *
    """
    row = await fetchrow(query, *values)
    return dict(row) if row else None


# ── learning_sessions ────────────────────────────────────────────────────────

async def create_session(
    session_id: str, clerk_user_id: str, skill_focus: str, start_time: str | None = None
) -> dict:
    start_dt = None
    if start_time is not None:
        try:
            start_dt = datetime.fromisoformat(start_time)
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=timezone.utc)  # treat naive as UTC rather than crashing
        except ValueError:
            start_dt = None  # malformed input — fall back to NOW() rather than failing consolidation
    row = await fetchrow(
        """
        INSERT INTO learning_sessions (session_id, clerk_user_id, skill_focus, start_time)
        VALUES ($1, $2, $3, COALESCE($4, NOW()))
        ON CONFLICT (session_id) DO NOTHING
        RETURNING *
        """,
        session_id, clerk_user_id, skill_focus, start_dt,
    )
    return dict(row) if row else {}


async def close_session(session_id: str, summary_metrics: dict | None = None) -> bool:
    """
    Idempotent session close. Returns True if this call closed the session,
    False if it was already closed or not found.
    Uses a single atomic UPDATE WHERE end_time IS NULL to prevent TOCTOU races.
    """
    row = await fetchrow(
        """
        UPDATE learning_sessions
        SET end_time = NOW(),
            summary_metrics = $2
        WHERE session_id = $1 AND end_time IS NULL
        RETURNING session_id
        """,
        session_id,
        json.dumps(summary_metrics or {}),
    )
    return row is not None


async def get_sessions(clerk_user_id: str, limit: int = 20) -> list[dict]:
    rows = await fetch(
        """
        SELECT * FROM learning_sessions
        WHERE clerk_user_id = $1
        ORDER BY start_time DESC
        LIMIT $2
        """,
        clerk_user_id, limit,
    )
    return [dict(r) for r in rows]


# ── error_events ─────────────────────────────────────────────────────────────

async def insert_error_events(session_id: str, errors: list[dict]) -> None:
    """Bulk insert error events from STM at session consolidation."""
    for err in errors:
        await execute(
            """
            INSERT INTO error_events
                (session_id, clerk_user_id, error_type, skill_domain, severity, context_excerpt)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT DO NOTHING
            """,
            session_id,
            err.get("clerk_user_id", ""),
            err.get("error_type", "unknown"),
            err.get("skill_domain", "SPEAKING"),
            err.get("severity", 1),
            err.get("context_excerpt"),
        )


async def get_errors(clerk_user_id: str, skill_domain: str | None = None, limit: int = 100) -> list[dict]:
    if skill_domain:
        rows = await fetch(
            """
            SELECT * FROM error_events
            WHERE clerk_user_id = $1 AND skill_domain = $2
            ORDER BY created_at DESC LIMIT $3
            """,
            clerk_user_id, skill_domain, limit,
        )
    else:
        rows = await fetch(
            """
            SELECT * FROM error_events
            WHERE clerk_user_id = $1
            ORDER BY created_at DESC LIMIT $2
            """,
            clerk_user_id, limit,
        )
    return [dict(r) for r in rows]


# ── vocabulary_mastery ────────────────────────────────────────────────────────

async def upsert_vocab(clerk_user_id: str, word: str, context_sentence: str) -> None:
    """Increment encounter_count and update last_encounter on each word encounter."""
    await execute(
        """
        INSERT INTO vocabulary_mastery (clerk_user_id, word, context_sentences, last_encounter, encounter_count)
        VALUES ($1, $2, ARRAY[$3], NOW(), 1)
        ON CONFLICT (clerk_user_id, word)
        DO UPDATE SET
            context_sentences = array_append(
                vocabulary_mastery.context_sentences[1:4], $3
            ),
            last_encounter = NOW(),
            encounter_count = vocabulary_mastery.encounter_count + 1,
            sm_retrievability = LEAST(1.0, vocabulary_mastery.sm_retrievability + 0.05)
        """,
        clerk_user_id, word, context_sentence,
    )


async def get_vocabulary(clerk_user_id: str, limit: int = 200) -> list[dict]:
    rows = await fetch(
        """
        SELECT * FROM vocabulary_mastery
        WHERE clerk_user_id = $1
        ORDER BY last_encounter DESC NULLS LAST
        LIMIT $2
        """,
        clerk_user_id, limit,
    )
    return [dict(r) for r in rows]


# ── conversation_archive ──────────────────────────────────────────────────────

async def insert_conversation(
    session_id: str,
    clerk_user_id: str,
    transcript: list[dict],
    embedding: list[float] | None = None,
) -> str:
    """
    Insert a conversation transcript with optional embedding vector.
    Returns the conv_id of the inserted record.
    """
    transcript_json = json.dumps(transcript)
    if embedding:
        row = await fetchrow(
            """
            INSERT INTO conversation_archive (session_id, clerk_user_id, transcript, embedding_vector)
            VALUES ($1, $2, $3::jsonb, $4::vector)
            RETURNING conv_id
            """,
            session_id, clerk_user_id, transcript_json, _vec_to_str(embedding),
        )
    else:
        row = await fetchrow(
            """
            INSERT INTO conversation_archive (session_id, clerk_user_id, transcript)
            VALUES ($1, $2, $3::jsonb)
            RETURNING conv_id
            """,
            session_id, clerk_user_id, transcript_json,
        )
    return str(row["conv_id"])


async def get_conversations(clerk_user_id: str, limit: int = 20) -> list[dict]:
    rows = await fetch(
        """
        SELECT conv_id, session_id, clerk_user_id, transcript, title, created_at
        FROM conversation_archive
        WHERE clerk_user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        """,
        clerk_user_id, limit,
    )
    return [dict(r) for r in rows]


async def update_conversation_title(clerk_user_id: str, conv_id: str, title: str) -> dict | None:
    """
    Rename a saved conversation. Returns the updated row, or None if conv_id
    doesn't exist or doesn't belong to clerk_user_id (ownership enforced in
    the WHERE clause, not just by the caller's require_matching_user check).
    """
    row = await fetchrow(
        """
        UPDATE conversation_archive
        SET title = $3
        WHERE conv_id = $1 AND clerk_user_id = $2
        RETURNING conv_id, session_id, clerk_user_id, transcript, title, created_at
        """,
        conv_id, clerk_user_id, title,
    )
    return dict(row) if row else None


# ── assessment_history ────────────────────────────────────────────────────────

async def get_assessment_history(clerk_user_id: str, skill_domain: str, limit: int = 50) -> list[dict]:
    """
    Ordered (oldest-first) theta history for one skill domain — the real data
    source for AGT-08's plateau detection. Most users will have very few rows
    (often just one, from one-time onboarding placement) until a periodic
    reassessment feature exists or a user retakes the assessment naturally.
    """
    rows = await fetch(
        """
        SELECT irt_score, assessed_at, skill_domain FROM assessment_history
        WHERE clerk_user_id = $1 AND skill_domain = $2 AND irt_score IS NOT NULL
        ORDER BY assessed_at ASC LIMIT $3
        """,
        clerk_user_id, skill_domain, limit,
    )
    return [dict(r) for r in rows]

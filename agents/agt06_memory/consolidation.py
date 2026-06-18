"""
Idempotent STM → LTM consolidation.

Called at session end (or timeout). Safe to call multiple times for the same
session_id — the second call detects the session is already closed and returns False.

Steps:
  1. Check if learning_sessions row already has end_time — if yes, return False (done)
  2. Read all STM keys for this session from Redis
  3. Close the learning_sessions row (set end_time = NOW())
  4. Write error_events rows
  5. Upsert vocabulary_mastery rows
  6. Write conversation_archive row (without embedding)
  7. Queue embedding generation as a background task (non-blocking)
  8. Emit agent.consolidation.complete to Kafka
  9. Return True
"""

import asyncio
import logging
from agents.agt06_memory import stm, ltm, embeddings
from agents.agt06_memory.ltm import _vec_to_str
from agents.shared.db.postgres import execute
from agents.shared.events.producer import emit

logger = logging.getLogger(__name__)


async def consolidate_session(session_id: str, clerk_user_id: str, skill_focus: str = "SPEAKING") -> bool:
    """
    Returns True if consolidated now, False if already done.
    Raises on unexpected errors after partial writes — callers should retry.
    """
    # Step 1: Idempotency check — if session already closed, skip
    sessions = await ltm.get_sessions(clerk_user_id, limit=50)
    for s in sessions:
        if str(s.get("session_id")) == session_id and s.get("end_time") is not None:
            logger.info("consolidate_session: session %s already consolidated — skipping", session_id)
            return False

    # Step 2: Read all STM data
    data = await stm.get_all_session_keys(session_id)
    errors = data["errors"] or []
    context = data["context"] or []
    vocab_items = data["vocab"] or []

    # Step 3: Ensure session row exists, then close it
    await ltm.create_session(session_id, clerk_user_id, skill_focus)
    closed = await ltm.close_session(session_id)
    if not closed:
        logger.info("consolidate_session: session %s already closed — skipping", session_id)
        return False

    # Step 4: Write error events
    for err in errors:
        err["clerk_user_id"] = clerk_user_id
    await ltm.insert_error_events(session_id, errors)

    # Step 5: Upsert vocabulary encounters
    for enc in vocab_items:
        try:
            await ltm.upsert_vocab(
                clerk_user_id,
                enc.get("word", ""),
                enc.get("context_sentence", ""),
            )
        except Exception as exc:
            logger.warning("vocab upsert failed word=%s err=%s", enc.get("word"), exc)

    # Step 6: Write conversation archive (no embedding yet)
    conv_id = await ltm.insert_conversation(session_id, clerk_user_id, context)

    # Step 7: Queue embedding generation async (non-blocking to caller)
    asyncio.create_task(
        _generate_and_store_embedding(conv_id, context)
    )

    # Step 8: Emit consolidation complete event
    await emit(
        "agent.consolidation.complete",
        {"sessionId": session_id, "clerkUserId": clerk_user_id, "convId": conv_id},
        agent_id="AGT06",
    )

    logger.info("consolidate_session: session %s consolidated successfully", session_id)
    return True


async def _generate_and_store_embedding(conv_id: str, context: list[dict]) -> None:
    """
    Background task: generate embedding vector and update conversation_archive.
    Runs after consolidation completes — never in the real-time path.
    """
    try:
        text = " ".join(t.get("content", "") for t in context if isinstance(t, dict))
        if not text.strip():
            return
        vector = await embeddings.embed_transcript(text)
        await execute(
            """
            UPDATE conversation_archive
            SET embedding_vector = $1::vector
            WHERE conv_id = $2
            """,
            _vec_to_str(vector), conv_id,
        )
    except Exception as exc:
        logger.warning("Embedding generation failed conv_id=%s err=%s", conv_id, exc)

-- agents/migrations/006_conversation_archive.sql
-- embedding_vector stores 768-dim nomic-embed-text embeddings for semantic search.
-- IVFFlat index is NOT created here — requires >=1000 rows to train effectively.
-- Create it manually once production data exists:
--   CREATE INDEX idx_conv_embedding ON conversation_archive
--       USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100);
CREATE TABLE IF NOT EXISTS conversation_archive (
    conv_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id       UUID NOT NULL REFERENCES learning_sessions(session_id) ON DELETE CASCADE,
    clerk_user_id    TEXT NOT NULL,
    transcript       JSONB NOT NULL DEFAULT '[]',
    embedding_vector VECTOR(768),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversation_archive(clerk_user_id);

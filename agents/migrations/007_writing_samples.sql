-- agents/migrations/007_writing_samples.sql
CREATE TABLE IF NOT EXISTS writing_samples (
    sample_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id     UUID NOT NULL REFERENCES learning_sessions(session_id) ON DELETE CASCADE,
    clerk_user_id  TEXT NOT NULL,
    prompt_text    TEXT NOT NULL,
    draft_text     TEXT NOT NULL,
    annotated_text TEXT,
    quality_scores JSONB NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_writing_user_time ON writing_samples(clerk_user_id, created_at DESC);

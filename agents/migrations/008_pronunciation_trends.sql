-- agents/migrations/008_pronunciation_trends.sql
CREATE TABLE IF NOT EXISTS pronunciation_trends (
    record_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id  TEXT NOT NULL,
    session_id     UUID NOT NULL REFERENCES learning_sessions(session_id) ON DELETE CASCADE,
    phoneme        TEXT NOT NULL,
    accuracy_score FLOAT NOT NULL CHECK (accuracy_score BETWEEN 0.0 AND 1.0),
    audio_uri      TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pron_user_phoneme ON pronunciation_trends(clerk_user_id, phoneme, created_at DESC);

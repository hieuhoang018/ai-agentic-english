-- agents/migrations/004_error_events.sql
CREATE TABLE IF NOT EXISTS error_events (
    event_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES learning_sessions(session_id) ON DELETE CASCADE,
    clerk_user_id   TEXT NOT NULL,
    error_type      TEXT NOT NULL,
    skill_domain    TEXT NOT NULL CHECK (skill_domain IN ('LISTENING','SPEAKING','READING','WRITING')),
    severity        INT NOT NULL CHECK (severity BETWEEN 1 AND 3),
    context_excerpt TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_errors_user_time ON error_events(clerk_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_errors_user_type ON error_events(clerk_user_id, error_type, skill_domain);

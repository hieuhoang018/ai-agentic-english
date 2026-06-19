-- agents/migrations/003_learning_sessions.sql
CREATE TABLE IF NOT EXISTS learning_sessions (
    session_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id    TEXT NOT NULL,
    start_time       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time         TIMESTAMPTZ,
    skill_focus      TEXT NOT NULL CHECK (skill_focus IN ('LISTENING','SPEAKING','READING','WRITING')),
    exercise_formats TEXT[] NOT NULL DEFAULT '{}',
    summary_metrics  JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_time ON learning_sessions(clerk_user_id, start_time DESC);

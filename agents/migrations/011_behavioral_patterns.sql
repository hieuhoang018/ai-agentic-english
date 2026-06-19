-- agents/migrations/011_behavioral_patterns.sql
CREATE TABLE IF NOT EXISTS behavioral_patterns (
    pattern_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id       TEXT UNIQUE NOT NULL,
    session_start_times FLOAT[] NOT NULL DEFAULT '{}',
    session_lengths     FLOAT[] NOT NULL DEFAULT '{}',
    completion_rates    FLOAT[] NOT NULL DEFAULT '{}',
    skill_engagement    JSONB NOT NULL DEFAULT '{}',
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- agents/migrations/002_learner_profiles.sql
CREATE TABLE IF NOT EXISTS learner_profiles (
    user_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id     TEXT UNIQUE NOT NULL,
    irt_theta         JSONB NOT NULL DEFAULT '{"L":0.0,"S":0.0,"R":0.0,"W":0.0}',
    vocabulary_beta   JSONB NOT NULL DEFAULT '{}',
    grammar_error_map JSONB NOT NULL DEFAULT '{}',
    behavioral_profile JSONB NOT NULL DEFAULT '{}',
    goal_profile      JSONB NOT NULL DEFAULT '{}',
    cold_start_flag   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_learner_profiles_clerk ON learner_profiles(clerk_user_id);

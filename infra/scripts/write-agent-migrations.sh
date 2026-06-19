#!/usr/bin/env bash
# Writes migration files 002-011 to agents/migrations/
# Run from repo root: bash infrastructure/scripts/write-agent-migrations.sh
# These are idempotent SQL files — safe to re-run.
set -e
DIR="$(cd "$(dirname "$0")/../.." && pwd)/agents/migrations"
mkdir -p "$DIR"

cat > "$DIR/002_learner_profiles.sql" << 'SQLEOF'
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
SQLEOF

cat > "$DIR/003_learning_sessions.sql" << 'SQLEOF'
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
SQLEOF

cat > "$DIR/004_error_events.sql" << 'SQLEOF'
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
SQLEOF

cat > "$DIR/005_vocabulary_mastery.sql" << 'SQLEOF'
-- agents/migrations/005_vocabulary_mastery.sql
CREATE TABLE IF NOT EXISTS vocabulary_mastery (
    vocab_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id     TEXT NOT NULL,
    word              TEXT NOT NULL,
    alpha             FLOAT NOT NULL DEFAULT 1.0,
    beta              FLOAT NOT NULL DEFAULT 1.0,
    sm_stability      FLOAT NOT NULL DEFAULT 1.0,
    sm_retrievability FLOAT NOT NULL DEFAULT 1.0,
    last_encounter    TIMESTAMPTZ,
    encounter_count   INT NOT NULL DEFAULT 0,
    context_sentences TEXT[] NOT NULL DEFAULT '{}',
    UNIQUE(clerk_user_id, word)
);
CREATE INDEX IF NOT EXISTS idx_vocab_user_encounter ON vocabulary_mastery(clerk_user_id, last_encounter DESC);
SQLEOF

cat > "$DIR/006_conversation_archive.sql" << 'SQLEOF'
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
SQLEOF

cat > "$DIR/007_writing_samples.sql" << 'SQLEOF'
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
SQLEOF

cat > "$DIR/008_pronunciation_trends.sql" << 'SQLEOF'
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
SQLEOF

cat > "$DIR/009_assessment_history.sql" << 'SQLEOF'
-- agents/migrations/009_assessment_history.sql
CREATE TABLE IF NOT EXISTS assessment_history (
    assess_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id TEXT NOT NULL,
    skill_domain  TEXT NOT NULL CHECK (skill_domain IN ('LISTENING','SPEAKING','READING','WRITING')),
    item_id       TEXT NOT NULL,
    response      JSONB NOT NULL,
    irt_score     FLOAT,
    cefr_band     TEXT,
    assessed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assess_user_time  ON assessment_history(clerk_user_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_assess_user_skill ON assessment_history(clerk_user_id, skill_domain);
SQLEOF

cat > "$DIR/010_agent_learning_plans.sql" << 'SQLEOF'
-- agents/migrations/010_agent_learning_plans.sql
-- Agent layer view of plan state. lm_plan_id references Learning Materials service by string.
CREATE TABLE IF NOT EXISTS agent_learning_plans (
    plan_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id    TEXT NOT NULL,
    lm_plan_id       TEXT NOT NULL,
    version          INT NOT NULL DEFAULT 1,
    skill_allocation JSONB NOT NULL DEFAULT '{}',
    activity_queue   JSONB NOT NULL DEFAULT '[]',
    rationale        TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_plans_user_active ON agent_learning_plans(clerk_user_id, is_active);
SQLEOF

cat > "$DIR/011_behavioral_patterns.sql" << 'SQLEOF'
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
SQLEOF

echo "All migration files written to $DIR"

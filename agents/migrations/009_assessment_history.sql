-- agents/migrations/009_assessment_history.sql
CREATE TABLE IF NOT EXISTS assessment_history (
    assess_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id TEXT NOT NULL,
    skill_domain  TEXT NOT NULL CHECK (skill_domain IN ('LISTENING','READING','WRITING')),
    item_id       TEXT NOT NULL,
    response      JSONB NOT NULL,
    irt_score     FLOAT,
    cefr_band     TEXT,
    assessed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assess_user_time  ON assessment_history(clerk_user_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_assess_user_skill ON assessment_history(clerk_user_id, skill_domain);

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

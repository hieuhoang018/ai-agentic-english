-- agents/migrations/012_vocab_next_review.sql
-- Add SM-2 next_review_at column used by AGT-07 rate_item writes.
ALTER TABLE vocabulary_mastery
    ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMPTZ;

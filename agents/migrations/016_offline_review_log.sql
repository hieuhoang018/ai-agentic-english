-- agents/migrations/016_offline_review_log.sql
-- Idempotency log for POST /offline/{userId}/sync replay.
-- Each client-generated review_id is inserted once; replayed syncs skip existing rows.
CREATE TABLE IF NOT EXISTS offline_review_log (
    review_id      TEXT        PRIMARY KEY,
    clerk_user_id  TEXT        NOT NULL,
    item_id        TEXT        NOT NULL,
    processed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_offline_review_user
    ON offline_review_log(clerk_user_id);

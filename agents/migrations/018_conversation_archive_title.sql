-- agents/migrations/018_conversation_archive_title.sql
-- Optional user-editable title for a saved conversation. NULL by default —
-- the frontend falls back to an auto-generated preview when unset.
ALTER TABLE conversation_archive ADD COLUMN IF NOT EXISTS title TEXT;

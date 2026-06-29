ALTER TABLE assessment_history
  ADD COLUMN IF NOT EXISTS assessment_session_id VARCHAR(255);

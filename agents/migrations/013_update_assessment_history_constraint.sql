-- agents/migrations/013_update_assessment_history_constraint.sql
-- Remove SPEAKING from assessment_history skill_domain constraint.
-- Speaking proficiency is inferred from session performance, not assessed via CAT.

ALTER TABLE assessment_history
  DROP CONSTRAINT IF EXISTS assessment_history_skill_domain_check;

ALTER TABLE assessment_history
  ADD CONSTRAINT assessment_history_skill_domain_check
  CHECK (skill_domain IN ('LISTENING','READING','WRITING'));

-- agents/migrations/014_speaking_theta_null.sql
-- Two-part fix for irt_theta.S default being 0.0 instead of null.
--
-- Part 1: Fix the column DEFAULT so all future INSERTs get S=null.
-- Part 2: Back-fill existing rows where S=0.0 and the user has no speaking sessions.
--         Only affects rows where S was the erroneous 0.0 default.
--         Safe to run multiple times (idempotent).

-- Part 1: fix column default (safe to run multiple times — idempotent DDL)
ALTER TABLE learner_profiles
  ALTER COLUMN irt_theta SET DEFAULT '{"L":0.0,"S":null,"R":0.0,"W":0.0}';

-- Part 2: back-fill existing rows
UPDATE learner_profiles
SET irt_theta = jsonb_set(irt_theta, '{S}', 'null'::jsonb)
WHERE (irt_theta->>'S') IS NOT NULL
  AND (irt_theta->>'S')::float = 0.0
  AND NOT EXISTS (
    SELECT 1 FROM learning_sessions
    WHERE learning_sessions.clerk_user_id = learner_profiles.clerk_user_id
      AND learning_sessions.skill_focus = 'SPEAKING'
  );

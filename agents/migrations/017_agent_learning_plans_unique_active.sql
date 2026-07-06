-- agents/migrations/017_agent_learning_plans_unique_active.sql
-- Defense-in-depth for the AGT-02 duplicate-active-plan race condition:
-- application-level serialization now uses pg_advisory_xact_lock(hashtext(clerk_user_id))
-- (see agents/agt02_learning_path/service.py generate_plan), but nothing at
-- the schema level previously prevented two active rows per user if that
-- lock were ever bypassed. This constraint makes it impossible outright.
--
-- NOTE: if duplicate active rows already exist from before this migration
-- (i.e. the race already fired in this database), this CREATE UNIQUE INDEX
-- will fail. Resolve by deactivating all but the most recent active row per
-- clerk_user_id before re-running this migration.
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_plans_one_active_per_user
ON agent_learning_plans (clerk_user_id)
WHERE is_active;

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

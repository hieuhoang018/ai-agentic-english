"""
AGT-02 Learning Path Agent — plan generation, persistence, and retrieval.

generate_plan() flow:
  1. Fetch the base learner profile from AGT-01 over HTTP (no session_id —
     this is an async/offline operation, not tied to a live tutor session).
     Falls back to a cold-start profile if AGT-01 is unreachable.
  2. If the caller supplied skill_estimates, overlay them onto irt_theta.
  3. Compute skill_allocation via optimizer.allocate_skills().
  4. Fetch (and Redis-cache) a catalog summary from the Learning Materials
     service, grouped by skill code. Falls back to {} (triggers
     optimizer.FALLBACK_ACTIVITIES) if unreachable.
  5. Build an LLM prompt describing the profile, allocation, and goals.
  6. Call the LLM router (AGT02, async tier) for a short rationale.
  7. Select today's activities via optimizer.select_daily_activities().
  8. Assign activity_id (uuid4) to each activity.
  9. Deactivate any existing active plan for this user (is_active=FALSE).
  10. Insert the new plan row with version = previous_version + 1.
  11. Emit agent.plan.events and return the new plan.
"""

from __future__ import annotations

import json
import logging
import os
import uuid

import httpx

from agents.shared.db.postgres import get_pool, fetchrow
from agents.shared.db.redis_client import get_redis
from agents.shared.events.producer import emit
from agents.shared.llm.router import call_llm, AgentID
from agents.agt02_learning_path import optimizer

logger = logging.getLogger(__name__)

AGT01_BASE_URL = os.environ.get("AGT01_BASE_URL", "http://agt01-profiling:8101")
LM_SERVICE_BASE_URL = os.environ.get("LM_SERVICE_BASE_URL", "http://learning-materials-service:4002")
LM_INTERNAL_SECRET = os.environ.get("LM_INTERNAL_SECRET", "dev-internal-secret")

# learning-materials-service's Module.skillFocus values -> optimizer skill codes (L/S/R/W).
_SKILL_FOCUS_TO_CODE = {"listening": "L", "speaking": "S", "reading": "R", "writing": "W"}

CATALOG_CACHE_KEY = "catalog:summary"
CATALOG_CACHE_TTL = 3600  # 1 hour

_COLD_START_PROFILE = {
    "irt_theta": {"L": 0.0, "S": None, "R": 0.0, "W": 0.0},
    "cold_start_flag": True,
}


async def _fetch_profile(clerk_user_id: str) -> dict:
    """Fetch the base learner profile from AGT-01. Falls back to cold-start on failure."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{AGT01_BASE_URL}/profile/{clerk_user_id}")
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("generate_plan: AGT-01 profile fetch failed for %s: %s", clerk_user_id, exc)
        return dict(_COLD_START_PROFILE)


def _modules_to_skill_catalog(modules: list[dict]) -> dict[str, list[dict]]:
    """
    Group learning-materials-service module summaries by optimizer skill code,
    converting each module into an activity dict select_daily_activities() understands.
    Modules with an unrecognized skillFocus are skipped.
    """
    catalog: dict[str, list[dict]] = {}
    for module in modules:
        skill = _SKILL_FOCUS_TO_CODE.get(module.get("skillFocus"))
        if not skill:
            continue
        lesson_count = module.get("lessonCount") or 1
        catalog.setdefault(skill, []).append({
            "activity_type": f"{module['skillFocus']}_module",
            "title": module["title"],
            "estimated_minutes": min(max(lesson_count * 5, 5), 20),
            "difficulty": module.get("cefrLevel", "B1"),
        })
    return catalog


async def _fetch_catalog_summary() -> dict:
    """
    Fetch the module catalog from learning-materials-service and group it by
    skill code, cached in Redis. Falls back to {} on any failure — optimizer
    FALLBACK_ACTIVITIES covers that.
    """
    r = await get_redis()
    cached = await r.get(CATALOG_CACHE_KEY)
    if cached:
        return json.loads(cached)

    catalog: dict[str, list[dict]] = {}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{LM_SERVICE_BASE_URL}/internal/catalog/summary",
                headers={"x-internal-secret": LM_INTERNAL_SECRET},
            )
            resp.raise_for_status()
            catalog = _modules_to_skill_catalog(resp.json().get("modules", []))
    except Exception as exc:
        logger.warning("generate_plan: catalog summary fetch failed: %s", exc)

    await r.setex(CATALOG_CACHE_KEY, CATALOG_CACHE_TTL, json.dumps(catalog))
    return catalog


async def _sync_learning_path(clerk_user_id: str, activities: list[dict]) -> str:
    """Persist the generated activities in Learning Materials without blocking plan creation."""
    fallback_path_id = str(uuid.uuid4())

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                f"{LM_SERVICE_BASE_URL}/internal/learning-paths",
                headers={"x-internal-secret": LM_INTERNAL_SECRET},
                json={
                    "userId": clerk_user_id,
                    "pathDefinition": {"modules": [], "activities": activities},
                },
            )
    except httpx.HTTPError as exc:
        logger.warning("generate_plan: Learning Materials sync failed for %s: %s", clerk_user_id, exc)
        return fallback_path_id

    if not response.is_success:
        logger.warning(
            "generate_plan: Learning Materials sync returned status %s for %s",
            response.status_code,
            clerk_user_id,
        )
        return fallback_path_id

    try:
        path_id = response.json().get("id")
    except ValueError:
        path_id = None

    if isinstance(path_id, str) and path_id:
        return path_id

    logger.warning("generate_plan: Learning Materials sync returned no path id for %s", clerk_user_id)
    return fallback_path_id


def _build_prompt(profile: dict, allocation: dict, goals: list[str]) -> list[dict]:
    theta = profile.get("irt_theta") or {}
    system = (
        "You are AGT-02, the Learning Path agent for a Vietnamese working "
        "professional learning English. Given IRT ability estimates and a "
        "skill time allocation, write a 1-2 sentence rationale for today's "
        "plan in plain, encouraging English."
    )
    user = json.dumps({
        "irt_theta": theta,
        "skill_allocation": allocation,
        "goals": goals,
        "cold_start": profile.get("cold_start_flag", True),
    })
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


async def generate_plan(clerk_user_id: str, request: dict) -> dict:
    """
    request: validated GeneratePlanRequest fields
      (skill_estimates, daily_minutes, goals).
    """
    daily_minutes = request.get("daily_minutes", 15)
    goals = request.get("goals") or []
    skill_estimates = request.get("skill_estimates")

    profile = await _fetch_profile(clerk_user_id)

    if skill_estimates:
        theta = dict(profile.get("irt_theta") or {})
        theta.update(skill_estimates)
        profile["irt_theta"] = theta

    allocation = optimizer.allocate_skills(profile)
    catalog = await _fetch_catalog_summary()

    messages = _build_prompt(profile, allocation, goals)
    rationale = await call_llm(messages, AgentID.AGT02)

    raw_activities = optimizer.select_daily_activities(allocation, daily_minutes, catalog)
    activities = [
        {**activity, "activity_id": str(uuid.uuid4()), "completed": False}
        for activity in raw_activities
    ]
    lm_plan_id = await _sync_learning_path(clerk_user_id, activities)

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow(
                """
                SELECT plan_id, version FROM agent_learning_plans
                WHERE clerk_user_id = $1 AND is_active = TRUE
                ORDER BY created_at DESC LIMIT 1
                FOR UPDATE
                """,
                clerk_user_id,
            )
            next_version = (existing["version"] + 1) if existing else 1
            if existing:
                await conn.execute(
                    "UPDATE agent_learning_plans SET is_active = FALSE WHERE plan_id = $1",
                    existing["plan_id"],
                )

            row = await conn.fetchrow(
                """
                INSERT INTO agent_learning_plans
                    (clerk_user_id, lm_plan_id, version, skill_allocation, activity_queue, rationale, is_active)
                VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, TRUE)
                RETURNING *
                """,
                clerk_user_id, lm_plan_id, next_version,
                json.dumps(allocation), json.dumps(activities), rationale,
            )

    plan = _row_to_plan(row)

    await emit(
        "agent.plan.events",
        {"planId": plan["plan_id"], "clerkUserId": clerk_user_id, "version": plan["version"]},
        agent_id="AGT02",
    )
    return plan


async def get_active_plan(clerk_user_id: str) -> dict | None:
    row = await fetchrow(
        """
        SELECT * FROM agent_learning_plans
        WHERE clerk_user_id = $1 AND is_active = TRUE
        ORDER BY created_at DESC LIMIT 1
        """,
        clerk_user_id,
    )
    return _row_to_plan(row) if row else None


async def get_today_plan(clerk_user_id: str) -> dict:
    plan = await get_active_plan(clerk_user_id)
    if not plan:
        return {"clerk_user_id": clerk_user_id, "plan_id": None, "activities": [], "daily_minutes": 0}
    return {
        "clerk_user_id": clerk_user_id,
        "plan_id": plan["plan_id"],
        "activities": plan["activities"],
        "daily_minutes": sum(a["estimated_minutes"] for a in plan["activities"]),
    }


def _row_to_plan(row) -> dict:
    d = dict(row)
    for key in ("skill_allocation", "activity_queue"):
        if isinstance(d.get(key), str):
            d[key] = json.loads(d[key])
    d["plan_id"] = str(d["plan_id"])
    d["activities"] = d.pop("activity_queue")
    return d

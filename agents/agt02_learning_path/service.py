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
     optimizer.FALLBACK_ACTIVITIES) if unreachable. The cached catalog is
     always the full, unfiltered set — level filtering happens after the
     cache read (see step 4b) so the shared cache entry stays valid across
     learners at different CEFR levels.
  4b. Reorder each skill's module pool by proximity to profile.goal_profile
      .currentLevel via _filter_catalog_by_level(): modules at-or-above the
      learner's level sort first (closest first), so select_daily_activities'
      greedy fill picks level-appropriate content instead of whatever is
      first in DB order. A skill is never left empty by this step — if no
      module meets the learner's level, the full original pool is kept,
      ordered closest-below-first.
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

# Ordinal ranking of CEFR levels, low to high. Mirrors the level set used
# elsewhere in the codebase (e.g. agt09_recommendation's _CEFR_DIFFICULTY).
_CEFR_RANK = {"A1": 0, "A2": 1, "B1": 2, "B2": 3, "C1": 4, "C2": 5}

CATALOG_CACHE_KEY = "catalog:summary:v2"
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
        skill_focus = module.get("skillFocus")
        skill = _SKILL_FOCUS_TO_CODE.get(skill_focus)
        module_id = module.get("id")
        title = module.get("title")
        if not skill or not module_id or not title:
            continue
        lesson_count = module.get("lessonCount") or 1
        lessons = [
            {
                "lessonId": lesson["id"],
                "exerciseIds": list(lesson.get("exerciseIds") or []),
            }
            for lesson in (module.get("lessons") or [])
            if isinstance(lesson, dict) and lesson.get("id")
        ]
        catalog.setdefault(skill, []).append({
            "module_id": module_id,
            "path_module": {"moduleId": module_id, "lessons": lessons},
            "activity_type": f"{skill_focus}_module",
            "title": title,
            "estimated_minutes": min(max(lesson_count * 5, 5), 20),
            "difficulty": module.get("cefrLevel", "B1"),
        })
    return catalog


def _filter_catalog_by_level(catalog: dict[str, list[dict]], current_level: str | None) -> dict[str, list[dict]]:
    """
    Reorder (and, where possible, restrict) each skill's module pool so
    select_daily_activities' greedy fill prefers modules at or above the
    learner's current_level, instead of raw catalog/DB order.

    - Modules at-or-above current_level are kept and sorted closest-first
      (e.g. a B2 learner sees B2, then C1, then C2).
    - If no module in a skill meets current_level (e.g. a C2 learner in a
      skill with only lower-level content), the full original pool is kept
      instead of an empty list, sorted closest-below-first — real catalog
      content at the wrong level is still preferable to generic
      FALLBACK_ACTIVITIES placeholders.
    - Unrecognized/missing current_level is a no-op: returns catalog unchanged
      (this is the cold-start / no goal_profile path).
    """
    target_rank = _CEFR_RANK.get(current_level)
    if target_rank is None:
        return catalog

    filtered: dict[str, list[dict]] = {}
    for skill, items in catalog.items():
        at_or_above = [
            item for item in items
            if _CEFR_RANK.get(item.get("difficulty"), target_rank) >= target_rank
        ]
        if at_or_above:
            filtered[skill] = sorted(
                at_or_above,
                key=lambda item: _CEFR_RANK.get(item.get("difficulty"), target_rank),
            )
        else:
            filtered[skill] = sorted(
                items,
                key=lambda item: -_CEFR_RANK.get(item.get("difficulty"), 0),
            )
    return filtered


def _build_path_definition(activities: list[dict]) -> dict:
    """
    Convert selected activities into the Learning Materials pathDefinition.
    path_module is an internal selection hint; module_id stays on activities
    so downstream UI can link activities back to database modules.
    """
    modules: list[dict] = []
    seen_module_ids: set[str] = set()
    cleaned_activities: list[dict] = []

    for activity in activities:
        path_module = activity.get("path_module")
        if isinstance(path_module, dict):
            module_id = path_module.get("moduleId")
            if isinstance(module_id, str) and module_id and module_id not in seen_module_ids:
                modules.append({
                    "moduleId": module_id,
                    "lessons": [
                        {
                            "lessonId": lesson["lessonId"],
                            "exerciseIds": list(lesson.get("exerciseIds") or []),
                        }
                        for lesson in (path_module.get("lessons") or [])
                        if isinstance(lesson, dict) and lesson.get("lessonId")
                    ],
                })
                seen_module_ids.add(module_id)

        cleaned_activities.append({
            key: value
            for key, value in activity.items()
            if key != "path_module"
        })

    return {"modules": modules, "activities": cleaned_activities}


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

    await r.set(CATALOG_CACHE_KEY, json.dumps(catalog), ex=CATALOG_CACHE_TTL)
    return catalog


async def _sync_learning_path(clerk_user_id: str, path_definition: dict) -> str:
    """Persist the generated path definition in Learning Materials without blocking plan creation."""
    fallback_path_id = str(uuid.uuid4())

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                f"{LM_SERVICE_BASE_URL}/internal/learning-paths",
                headers={"x-internal-secret": LM_INTERNAL_SECRET},
                json={
                    "userId": clerk_user_id,
                    "pathDefinition": path_definition,
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
    current_level = (profile.get("goal_profile") or {}).get("currentLevel")
    catalog = _filter_catalog_by_level(catalog, current_level)

    messages = _build_prompt(profile, allocation, goals)
    rationale = await call_llm(messages, AgentID.AGT02)

    raw_activities = optimizer.select_daily_activities(allocation, daily_minutes, catalog)
    activities = [
        {**activity, "activity_id": str(uuid.uuid4()), "completed": False}
        for activity in raw_activities
    ]
    path_definition = _build_path_definition(activities)
    activities = path_definition["activities"]
    lm_plan_id = await _sync_learning_path(clerk_user_id, path_definition)

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Per-user advisory lock, held for the transaction's lifetime.
            # `FOR UPDATE` below only locks a row that already exists, so two
            # concurrent calls for a user with NO active plan yet (first-ever
            # plan, or a race right after the prior plan was deactivated)
            # would otherwise both see existing=None and both insert
            # version=1/is_active=TRUE. The advisory lock serializes ALL
            # generate_plan calls for a given user regardless of whether a
            # row exists, closing that gap.
            await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))", clerk_user_id)

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
    plan["path_definition"] = path_definition

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

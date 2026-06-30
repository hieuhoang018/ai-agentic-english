# Implementation Stages: DB-Backed Learning Path Matching

## Summary

Implement this in five small stages so each layer can be verified independently. The core rule is: onboarding must persist and display the AGT-02-generated learning path using real Learning Materials database modules, and Practice Center must show only modules from the active path. Speaking stays unchanged for now.

## Stage 1: Extend The Existing Catalog Contract

Goal: give AGT-02 enough database IDs to build a real `pathDefinition.modules` graph.

Implementation guide:

- Update `packages/shared/src/dto/learning-materials.ts`:
  - Add optional `module_id?: string` to activity objects inside `PathDefinition.activities`.
  - Add `lessons: Array<{ id: string; exerciseIds: string[] }>` to each `CatalogSummaryDto.modules[]` item.
- Update `services/learning-materials-service/src/routes/internal.ts`:
  - In `GET /internal/catalog/summary`, include each module’s ordered lessons.
  - For each lesson, include ordered exercise IDs.
  - Preserve all existing fields so current AGT-02 code remains compatible.
- Update Learning Materials tests:
  - Extend the internal catalog summary test to assert `modules[0].lessons[0].id` and `exerciseIds`.
  - Keep existing learning path immutability tests unchanged.

Acceptance criteria:

- `GET /internal/catalog/summary` returns module IDs, lesson IDs, and exercise IDs.
- No public API route changes are required.
- Existing Learning Materials tests still pass after updating expected summary shape.

## Stage 2: Make AGT-02 Persist Real Path Modules

Goal: keep AGT-02’s existing allocation and daily-selection logic, but attach DB module references to selected activities.

Implementation guide:

- In `agents/agt02_learning_path/service.py`:
  - Change `CATALOG_CACHE_KEY` to a new version, for example `catalog:summary:v2`.
  - Update `_modules_to_skill_catalog()` so each generated catalog item includes:
    - `module_id`
    - `path_module: { moduleId, lessons: [{ lessonId, exerciseIds }] }`
    - existing activity fields: `activity_type`, `title`, `estimated_minutes`, `difficulty`
  - Add a helper like `_build_path_definition(activities)`:
    - Collect unique `path_module` entries by `moduleId`, preserving selected order.
    - Remove internal-only `path_module` from activities before returning/syncing.
    - Keep `module_id` on activities for UI linking.
    - Return `{ "modules": [...], "activities": [...] }`.
  - Change `_sync_learning_path(clerk_user_id, activities)` to accept `path_definition` instead and post that full object to Learning Materials.
  - In `generate_plan()`, build `path_definition` after activity IDs are assigned, sync it, store activities in the existing `activity_queue`, and include `path_definition` in the returned plan dict.
  - If no selected activity has a real `path_module`, return an empty `modules` array; the orchestrator will reject it rather than silently onboarding with synthetic content.

- In `agents/agt02_learning_path/optimizer.py`:
  - Update `select_daily_activities()` to preserve optional metadata from catalog items.
  - Build each selected activity from `dict(item)` plus `skill_domain`, instead of reconstructing only known display fields.
  - Preserve fallback behavior internally, but fallback items will not have `path_module`.

- Update AGT-02 tests:
  - Catalog grouping test should expect `module_id` and `path_module`.
  - Generate-plan test should assert the Learning Materials sync body has non-empty `pathDefinition.modules` when catalog data includes lesson/exercise IDs.
  - Add a fallback test where catalog fetch fails and synced `pathDefinition.modules` is empty.

Acceptance criteria:

- AGT-02 still creates and versions `agent_learning_plans`.
- Synced Learning Materials paths contain real `moduleId`, `lessonId`, and `exerciseIds`.
- Activity display data remains backward-compatible.

## Stage 3: Tighten The Onboarding Orchestrator Response

Goal: make onboarding return the full DB-backed path and fail clearly if AGT-02 cannot produce one.

Implementation guide:

- In `agents/agt_orchestrator/main.py`:
  - After AGT-02 returns a plan, read `plan["path_definition"]`.
  - If missing, fetch `GET {LM_SERVICE_BASE_URL}/internal/learning-paths/{plan["lm_plan_id"]}` with `x-internal-secret`.
  - Validate that `pathDefinition.modules` exists and has at least one module.
  - If validation fails, return `502` with a clear message such as `Generated path has no database-backed modules`.
  - Return:
    - `id`: AGT-02 `plan_id`
    - `learningPathId`: `lm_plan_id`
    - `userId`
    - `pathDefinition`
    - `createdAt`
  - Keep `learning-path.ready` emission after successful validation.

- Update orchestrator tests:
  - Happy path expects full `pathDefinition.modules`.
  - Missing or empty `modules` returns `502`.
  - Kafka failure remains non-fatal after a valid path is returned.

Acceptance criteria:

- A successful onboarding response always includes DB-backed modules.
- Users are not marked ready with a synthetic-only path.
- Existing AGT-01 and AGT-02 orchestration sequence remains unchanged.

## Stage 4: Update Onboarding UI To Render The Real Path

Goal: show the learning path generated by the system agent, including the modules it selected.

Implementation guide:

- In `apps/web/lib/api/types.ts`:
  - Change `OnboardingResponse.pathDefinition` to use the shared `PathDefinition`.
  - Add `learningPathId?: string` if returned by the orchestrator.
- In `apps/web/app/onboarding/_components/GeneratedPlanPreview.tsx`:
  - Accept `pathDefinition` instead of only `activities`.
  - Render `pathDefinition.activities` when present.
  - If activities are empty but modules exist, render module IDs/titles from activity metadata where available.
  - Keep the empty state for a genuinely empty path.
- In `apps/web/app/onboarding/plan/page.tsx`:
  - Pass the full `state.plan.pathDefinition` to `GeneratedPlanPreview`.
  - Keep the existing loading, retry, and completion gating behavior.

Acceptance criteria:

- The onboarding plan preview is sourced from the orchestrator response.
- Completion remains impossible when path generation fails.
- No local mock learning path is used.

## Stage 5: Filter Practice Center By Active Learning Path

Goal: Practice Center reading/listening/writing modules match the active learning path.

Implementation guide:

- Add a helper under Practice Center, for example `apps/web/app/main/practice-center/_lib/active-path.ts`:
  - Read the current Clerk user ID via `auth()`.
  - Fetch `/learning-paths/${userId}/active` through `serverApiFetch`.
  - Return an ordered `Set` or array of module IDs from `pathDefinition.modules`.
  - If the API returns 404, return an empty module list.
- Update reading/listening/writing pages:
  - Fetch `/modules` as they do now.
  - Filter modules by both `module.skillFocus === skill.id` and active path module IDs.
  - Sort by active path module order, not global module order.
- Update `ModuleList` empty state:
  - Use copy that explains there are no modules in the current learning path for that skill.
- Update the module detail page:
  - Before fetching lessons/exercises, check whether `moduleId` is in the active path.
  - If not, call `notFound()`.
  - Keep existing DB lesson/exercise fetching unchanged.

Acceptance criteria:

- Practice Center only lists modules from the active learning path.
- Deep links to non-path modules return 404.
- Reading/listening/writing still load lessons and exercises from the database.
- Speaking remains unchanged.

## Stage 6: Verification

Run focused checks first, then broader checks.

Required tests:

- Learning Materials service tests.
- AGT-02 service tests.
- AGT Orchestrator onboarding tests.
- Web lint:
  - `npm run lint --workspace @ai-agentic-english/web`

Manual smoke test:

- Start the stack.
- Complete onboarding for a fresh user.
- Confirm the response contains `pathDefinition.modules`.
- Confirm the Learning Materials `learning_paths` row has the same modules.
- Open Practice Center reading/listening/writing.
- Confirm each skill page only displays modules included in the active path.
- Try a direct URL to a DB module not in the active path and confirm it 404s.

## Assumptions

- Speaking is intentionally left unhandled in this pass.
- No database schema migration is needed.
- Learning Materials remains the owner of modules and persisted learning paths.
- AGT-02 remains the owner of plan generation; changes only attach real DB IDs to its current outputs.
- Synthetic fallback activities may still exist internally, but they must not allow onboarding to succeed without at least one DB-backed module.

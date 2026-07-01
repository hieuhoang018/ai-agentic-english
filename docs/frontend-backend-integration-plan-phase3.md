# DB-Backed Review Center + CEFR Self-Assessment Plan

## Summary
- Replace self-assessment’s single 0-10 scale with CEFR selectors for `reading`, `listening`, and `writing`.
- Feed self-assessment and assessment-test results into learning-path generation through AGT-02’s existing `skill_estimates`.
- Make flashcards and grammar review display real learning-materials database data.
- Defer flashcard add/delete behavior to a separate later plan.

## Stage 0: Data Preflight
- Check `vocab_entries` and `grammar_points` row counts in the learning-materials database.
- If empty, run the learning-materials migration and seed commands from `infra/README.md`, especially `seed:vocab` and `seed:grammar`.
- Do not implement application fallback fixtures as the primary source of truth.

Stage 0 preflight log (2026-07-01):
- Checked `postgresql://postgres:postgres@localhost:5434/learning_materials_service`, matching the `infra/README.md` learning-materials Postgres port.
- Local row counts: `vocab_entries=7798`, `grammar_points=292`.
- Because both tables contain rows, no seed command was run.
- Also checked the service-local `.env` default URL on `localhost:5432`; no database was reachable there. Local development should use the infra URL from `infra/README.md` unless `.env` is updated.
- If a developer sees zero rows, run the migration and seed commands from `infra/README.md`, at minimum `seed:vocab` and `seed:grammar`, before validating review-center content.

Acceptance criteria:
- Implementer records whether local `vocab_entries` and `grammar_points` contain rows.
- A fresh seeded database can provide vocab and grammar data without code changes.
- Empty DB state produces a clear setup note, not misleading static review content.

## Stage 1: Self-Assessment Data Flow
- Update onboarding self-assessment UI to collect CEFR levels for `reading`, `listening`, and `writing`.
- Store those choices in `profile.assessmentLevels`, matching the test-assessment result shape.
- Keep `currentLevel` as a summary level for backwards compatibility.
- Add optional `skillEstimates` to the onboarding request contract:
  - `reading -> R`
  - `listening -> L`
  - `writing -> W`
  - `A1=-2`, `A2=-1`, `B1=0`, `B2=1`, `C1=2`, `C2=3`
- Update the orchestrator only enough to accept `skillEstimates` and forward it to AGT-02 as `skill_estimates`.

Acceptance criteria:
- Users cannot continue self-assessment until all three skills have CEFR values.
- Test assessment and self-assessment both produce the same request shape for path generation.
- Existing onboarding works when `skillEstimates` is omitted.
- AGT-02 receives non-null `skill_estimates` for self-assessment and test-derived skill levels.

## Stage 2: Learning-Materials Review APIs
- Add authenticated read endpoints in learning-materials service for review-center data:
  - flashcard topics derived from `vocab_entries.cefrLevel`
  - flashcards derived from `VocabEntry`, primary `VocabSense`, and primary `VocabPron`
  - grammar sections grouped by `grammar_points.category`
  - grammar lesson/detail data from `GrammarPoint` and `GrammarExample`
- Add shared DTOs for review flashcard and grammar read models.
- Add Kong routes for these new learning-materials endpoints.
- Keep endpoints read-only in this plan.

Acceptance criteria:
- Flashcard topic API returns non-empty CEFR-based topics when vocab seed data exists.
- Flashcard API returns term, part of speech, definition, example, IPA when available, and CEFR metadata.
- Grammar API returns category sections and detail pages from seeded grammar rows.
- APIs require auth through Kong.
- No user-owned flashcard mutation endpoints are introduced in this plan.

## Stage 3: Review Center Frontend Integration
- Replace static imports from review-center fixture data with API-backed loading.
- Make flashcard topic list, topic detail, study view, grammar list, and grammar detail render database records.
- Remove or quarantine static review fixtures so they cannot silently mask missing DB data.
- Keep review components typed and data-shaped so add/delete and future review features can plug in later.
- Leave add/delete buttons either hidden, disabled with neutral copy, or visually preserved but non-mutating until the later plan.

Acceptance criteria:
- Flashcard pages display real vocab data after seeding.
- Grammar pages display real grammar data after seeding.
- Refreshing pages preserves the same DB-backed content.
- Missing or empty DB data shows a clear empty/setup state.
- No add/delete request is made from the UI in this plan.

## Stage 4: Verification
- Add or update tests for:
  - onboarding request conversion with self-assessment levels
  - orchestrator pass-through of `skillEstimates`
  - learning-materials review API mapping and auth behavior
  - frontend empty/loading/success states where practical
- Run focused service tests plus frontend lint/type checks.

Acceptance criteria:
- Existing onboarding and assessment tests still pass.
- New self-assessment mapping tests cover all three skills.
- New API tests prove data comes from Prisma models, not static fixtures.
- Frontend lint/typecheck passes.
- Manual QA confirms learning path generation changes when CEFR skill selections change.

## Explicitly Deferred
- Adding flashcards to a topic.
- Deleting catalog or user-created flashcards.
- Persisting user-owned flashcard state.
- Any user-service flashcard tables or mutation endpoints.

These will be handled in a separate plan.

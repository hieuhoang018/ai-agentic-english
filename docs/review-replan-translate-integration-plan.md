# AGT-06 review dashboard / AGT-02 replan / AGT-11 translate — Integration Plan

Status: draft, 2026-07-08
Audience: backend dev (Hieu, TS + agents side + Kong) and frontend dev, working together
Relates to: `docs/homepage-progress-integration-plan.md` (same "built but unwired" audit pattern,
same doc structure, same Kong/proxy conventions reused here), `CLAUDE.local.md`'s "Backend ↔
frontend wiring inventory" section (the audit that produced this plan).

## 0. Why this doc exists

Three agents have real, tested backend logic that Kong never exposes and the frontend never
calls:

- **AGT-06** (`GET /review-center/{clerk_user_id}`) — a full bundle of errors, vocabulary
  mastery, session history, and conversation transcripts. Nothing renders it; `main/review-center`
  only has DB-backed flashcards/grammar (PR #37) + the SM-2 due-review queue (PR #48).
- **AGT-02** (`POST /plans/{clerk_user_id}/replan`) — concrete, currently-orphaned gap: Settings
  page lets a user change `dailyTimeBudgetMinutes` and PATCHes User Service, but never re-triggers
  AGT-02, so the user's daily plan silently goes stale after the change.
- **AGT-11** (`POST /translate`) — Vietnamese translation scoped to the learner's IRT-derived
  proficiency zone. Only ever called internally by AGT-03 during speaking; no learner-facing UI
  anywhere despite being a generic, ready-to-use "translate this content" call.

(AGT-07's `/tests/{id}/daily` was dropped from this batch — confirmed with the user 2026-07-08:
it's an explicit stub with no answer key/options, per `agt07_review/test_builder.py`'s own
docstring, not worth a UI yet. Revisit once Phase 8+'s real 40/30/20/10 composition lands.)

All three follow the same shape: add Kong-facing auth, add a Kong route, add a Next.js proxy
route, wire a frontend surface. Existing precedent for every step already exists in the codebase
(AGT-07's `/schedule`, `/offline` work from PR #47/#48, AGT-01/06/08's `/summary/*` "new prefix,
don't disturb the internal route" pattern) — reuse those patterns exactly, don't invent new ones.

## 1. AGT-06 review-center dashboard

**Backend** (`agents/agt06_memory/main.py`):
- `GET /review-center/{clerk_user_id}` currently has **no auth guard** — add
  `_: str = Depends(require_matching_user)` (already imported in this file), matching every other
  Kong-exposed per-user route in the codebase (AGT-07/08/09/10 pattern).
- No other backend change — `review_center()` already returns `{errors, vocabulary, sessions,
  conversations, semantic_search_available}` pulled from `ltm.get_errors/get_vocabulary/
  get_sessions/get_conversations`.
- Add a regression test in `agents/agt06_memory/tests/` mirroring
  `agt07_review/tests/test_rate_http.py`'s `test_..._returns_403_for_mismatched_user` (uses
  `agents.shared.testing.auth_header`).

**Kong** (`gateway/kong/kong.yml`): new service block, modeled exactly on `agt06-sessions-summary`:
```yaml
- name: agt06-review-center
  url: http://agt06-memory:8106/review-center
  routes:
    - name: agt06-review-center-route
      paths: [/api/review-center]
      strip_path: true
      methods: [GET, OPTIONS]
      plugins:
        - name: jwt
          config: { claims_to_verify: [exp, nbf] }
```

**Next proxy**: `apps/web/app/api/review-center/route.ts`, copy `apps/web/app/api/review/due/
route.ts`'s auth/error-handling shape exactly (Clerk `auth()` → `getToken()` → `apiFetch`).

**Types** (`apps/web/lib/api/types.ts`): add
```ts
export type ReviewCenterErrorEvent = { event_id: string; error_type: string; skill_domain: string; severity: number; context_excerpt: string | null; created_at: string }
export type ReviewCenterVocabItem = { vocab_id: string; word: string; encounter_count: number; sm_retrievability: number; last_encounter: string | null; context_sentences: string[] }
export type ReviewCenterSession = { session_id: string; start_time: string; end_time: string | null; skill_focus: string }
export type ReviewCenterConversation = { conv_id: string; session_id: string; transcript: unknown; created_at: string }
export type ReviewCenterBundle = { errors: ReviewCenterErrorEvent[]; vocabulary: ReviewCenterVocabItem[]; sessions: ReviewCenterSession[]; conversations: ReviewCenterConversation[]; semantic_search_available: boolean }
```

**Frontend page**: new `apps/web/app/main/review-center/dashboard/page.tsx` (client component,
same loading/error/success state pattern as `due/page.tsx`). Four sections:
- **Lỗi thường gặp** — group `errors` by `skill_domain`, show `error_type` + severity dot +
  `context_excerpt`.
- **Từ vựng đã học** — `vocabulary` list, word + a retrievability progress bar
  (`sm_retrievability` 0–1) + `encounter_count`.
- **Lịch sử buổi học** — `sessions` list, date + duration (`end_time - start_time`) + `skill_focus`.
- **Hội thoại đã lưu** — `conversations`, collapsed by default, expand to show `transcript`.

Add a 4th `ReviewFeatureCard` to `apps/web/app/main/review-center/page.tsx` ("Nhật ký học tập" /
"Xem lại lỗi, từ vựng và lịch sử học tập của bạn") linking to the new page, and a `dashboardPath()`
helper in `_utils/review-routes.ts` next to the existing `duePath`/`flashcardsPath`/`grammarPath`.

## 2. AGT-02 replan, auto-triggered from Settings

**Backend** (`agents/agt02_learning_path/main.py`): the existing `/plans/*` routes are
internal-secret-gated (`verify_internal_secret`), meant for service-to-service calls (orchestrator,
AGT-10) — don't touch them. Add a **new**, separate, JWT-scoped route, same "new prefix, don't
disturb the internal one" pattern already used for AGT-01/06/08's `/summary/*`:
```python
from agents.shared.auth import require_matching_user
...
@app.post("/replan/{clerk_user_id}")
async def replan_for_user(clerk_user_id: str, body: GeneratePlanRequest, _: str = Depends(require_matching_user)):
    """User-facing replan trigger (e.g. after changing daily time budget in Settings)."""
    return await service.generate_plan(clerk_user_id, body.model_dump())
```
Reuses the existing `GeneratePlanRequest` model as-is (`skill_estimates`, `daily_minutes` `ge=5,
le=180`, `goals`) and the exact same `service.generate_plan` the internal route calls — no new
service code needed.

Add a regression test (`agents/agt02_learning_path/tests/`) for the 403-mismatch case, same
pattern as above.

**Kong**: new service, same shape as AGT-06's above:
```yaml
- name: agt02-replan
  url: http://agt02-learning-path:8102/replan
  routes:
    - name: agt02-replan-route
      paths: [/api/plan/replan]
      strip_path: true
      methods: [POST, OPTIONS]
      plugins:
        - name: jwt
          config: { claims_to_verify: [exp, nbf] }
```

**Next proxy**: `apps/web/app/api/plan/replan/route.ts` — POST handler, same auth shape as
`apps/web/app/api/review/rate/route.ts`, forwards `{ daily_minutes, goals, skill_estimates }` to
`/plan/replan/${userId}`.

**Frontend** (`apps/web/app/main/settings/page.tsx`): in `handleSave()`, after the `PATCH
/api/users/me` succeeds, if `dailyTimeBudgetMinutes` changed from the value loaded on mount, fire
a best-effort `POST /api/plan/replan` with `{ daily_minutes: dailyTimeBudgetMinutes, goals: [] }`
(goals empty is safe — `service.generate_plan` treats it as optional, only used for the LLM
rationale prompt). This call must not block or fail the settings save — wrap in its own
try/catch, swallow errors (log to console), don't surface a second error state to the user.

## 3. AGT-11 translation in Practice Center

**Backend** (`agents/agt11_translation/`):
- `models.py`: add `class TranslateContentRequest(BaseModel): content: str; session_type: str =
  "exercise"` (clerk_user_id now comes from the path, not the body — unlike the existing internal
  `TranslateRequest`).
- `main.py`: add
  ```python
  from agents.shared.auth import require_matching_user
  ...
  @app.post("/translate/{clerk_user_id}")
  async def translate_for_frontend(clerk_user_id: str, body: TranslateContentRequest, _: str = Depends(require_matching_user)):
      return await translate_for_user(body.content, clerk_user_id, body.session_type)
  ```
  Leave the existing body-based `POST /translate` (no path param, no guard) untouched — that's
  AGT-03's internal call, unrelated contract.
- While in this file: add `_: str = Depends(require_matching_user)` to the existing `GET
  /zone/{clerk_user_id}` too — it already has the right path-param shape, currently unguarded and
  unused by anyone, free to close now before it becomes a live IDOR surface once this file is
  Kong-routed.
- Add a 403-mismatch regression test in `agents/agt11_translation/tests/`.

**Kong**:
```yaml
- name: agt11-translate
  url: http://agt11-translation:8111/translate
  routes:
    - name: agt11-translate-route
      paths: [/api/translate]
      strip_path: true
      methods: [POST, OPTIONS]
      plugins:
        - name: jwt
          config: { claims_to_verify: [exp, nbf] }
```

**Next proxy**: `apps/web/app/api/translate/route.ts` — POST handler, forwards `{ content,
session_type }` to `/translate/${userId}`.

**Types**: add `TranslateResponse = { original: string; translated: string; zone: string;
zone_label: string; theta_r: number; cached: boolean }` to `lib/api/types.ts`.

**Frontend** (`apps/web/app/main/practice-center/_components/QuestionPanel.tsx`): next to the
existing `question.sourceText` block (the reading/listening passage), add a "Xem bản dịch" toggle
button. On first click, `POST /api/translate` with `{ content: question.sourceText, session_type:
'exercise' }`, cache the result in component state keyed by `question.id` (so toggling back and
forth doesn't re-fetch), render the translated text below the original with a small `zone_label`
caption. Follow the same loading/error state pattern already used for `audio` in this same file
(`usePresignedAudioUrl`'s status machine) for consistency — a small `idle/loading/ready/error`
state, not a new pattern.

## 4. Verification

- Python: `.venv`'s pytest for `agt06_memory`, `agt02_learning_path`, `agt11_translation` — all
  existing tests must still pass, plus the 3 new 403-mismatch tests.
- `cd infra && npm run kong:render && docker compose -f docker-compose.yml -f
  docker-compose.prod.yml up -d --build` (per `CLAUDE.local.md`'s live-inference instructions) to
  pick up the new Kong routes and rebuilt agent images.
- Frontend: `npm run typecheck`/`lint` in `apps/web`, then manually exercise all three flows in a
  logged-in browser session: open `/main/review-center/dashboard` and confirm real data renders;
  change daily time budget in `/main/settings`, save, confirm (via agt02 logs or a re-fetch of
  `/api/habit/library`'s today's-plan) the plan actually regenerated; open a reading/listening
  exercise in Practice Center and confirm the translate toggle returns real Vietnamese text.
- Update `CLAUDE.local.md`'s wiring inventory table and "Current Status" once merged, same as past
  PRs (AGT-06 row, AGT-02 row, AGT-11 row all currently marked ❌).

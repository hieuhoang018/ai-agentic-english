# Homepage + Progress — Integration Plan (AGT-08 / AGT-09 / AGT-10)

Status: draft, 2026-07-02
Audience: backend dev (Hieu, TS side + Kong) and frontend dev, working together
Relates to: `docs/frontend-backend-integration-plan.md` (apiFetch/Clerk-token pattern reused
here), `docs/agt03-realtime-speaking-integration-plan.md` (same "built but unwired" audit
pattern, same doc structure), `CLAUDE.local.md` "Backend ↔ frontend wiring inventory" section
(the audit that produced this plan).

**Sequencing note (2026-07-02): the AGT-08 persistence fix (§2) is already underway elsewhere —
don't duplicate that work.** Everything else in this plan (Stage A's AGT-09/AGT-10 Kong routes,
Stage B's homepage wiring, Stage C's non-AGT-08 pieces of the progress page) has no dependency on
it and should be implemented first. Only the AGT-08-specific slice of Stage A/C (the `/api/analysis`
Kong route and the progress page's insights/pattern data, if that gets picked up) waits on that
fix landing — treat it as blocked, not as something to start in parallel.

## 0. Why this doc exists

`apps/web/app/main/homepage/page.tsx` and `apps/web/app/main/progress/page.tsx` are the two most
hardcoded pages in the frontend — unlike `practice-center`/`review-center`/`speaking`, they don't
even have a `_data/*.ts` mock file to swap out; every number ("12 ngày streak", "68%", "IELTS 7.0
by 15/12/2024", the 7-bar weekly activity chart) is a literal in the JSX.

Meanwhile three backend agents already compute real versions of most of that data and are fully
untested-by-integration but unit-tested in isolation:

- **AGT-10 (Habit)** — `GET /library/{clerk_user_id}` already assembles, in parallel with partial-
  failure tolerance, exactly the four things a homepage "what should I do today" section needs:
  today's plan (from AGT-02), due-for-review count (from AGT-07), recommendations (from AGT-09),
  and a browse fallback (from Learning Materials). `GET /streak/{clerk_user_id}` reads a streak
  that's **already kept up to date automatically** — AGT-10's own Kafka consumer
  (`agt10_habit/consumers.py`) increments it on every `agent.session.end` event AGT-03 emits, so
  the frontend never needs to write to it, only read.
- **AGT-09 (Recommendation)** — `GET /recommendations/{clerk_user_id}`, cold-start-aware,
  Redis-cached (1h TTL), auto-invalidated by AGT-02 on re-plan.
- **AGT-08 (Analysis)** — real CUSUM persistent-error detection, real PELT plateau detection per
  skill, a multi-signal behavioral risk score. **Important caveat, not just a wiring gap**: see
  §2 — `GET /analysis/{id}/latest` is a stub that always returns `not_implemented: true`, and the
  only way to get real data is `POST /analysis/{id}/run`, which is not safe to call on every page
  view (see below).

This plan wires the two pages to real data in stages, calling out explicitly which pieces have a
clean 1:1 backend mapping today and which don't (rather than inventing endpoints that don't
exist).

## 1. What already exists (don't rebuild)

**Backend — all internal only today, no Kong routes:**

| Route | Method | Notes |
|---|---|---|
| `GET /library/{clerk_user_id}` (AGT-10, :8110) | GET | 4-tab bundle: today's plan / due-for-review / recommended / browse, `asyncio.gather(..., return_exceptions=True)` — a failing tab returns empty, never a 500 |
| `GET /streak/{clerk_user_id}` (AGT-10) | GET | Reads Redis, auto-updated by Kafka consumer on `agent.session.end` |
| `POST /streak/{clerk_user_id}/record` (AGT-10) | POST | **Don't call this from the frontend** — it's for the Kafka consumer path; calling it client-side would double-count a streak the consumer already recorded |
| `GET /recommendations/{clerk_user_id}` (AGT-09, :8109) | GET | `RecommendationItem[]`: `id, title, skillDomain?, cefrLevel?, rationale?, difficulty?, cold_start` |
| `POST /analysis/{clerk_user_id}/run` (AGT-08, :8108) | POST | Real computation — see §2 for why this isn't a plain GET-and-display |
| `GET /profile/{clerk_user_id}` (AGT-01, :8101) | GET | Has `irt_theta` (per-skill, map via `agents/shared/cefr.py:theta_to_cefr`) and `behavioral_profile` |
| `GET /ltm/{clerk_user_id}/sessions?limit=` (AGT-06, :8106) | GET | Raw `learning_sessions` rows: `start_time`, `end_time`, `skill_focus`, `summary_metrics` — no pre-aggregated duration-by-weekday, that's a frontend-side reduce |

**Frontend — `apps/web/app/main/`:**

- `homepage/page.tsx` — server component, zero data fetching. Four widgets: overall-progress card
  (+ streak badge), flashcard-review-due CTA, AI-tutor CTA (no data needed, already a correct
  `Link`), daily-tasks list (2 hardcoded "done", 2 hardcoded "pending").
- `progress/page.tsx` — server component, zero data fetching. Overall %, 3-phase roadmap
  (Foundation/Intermediate/Advanced), per-skill target-vs-current bars (`ProgressSummaryCard`,
  reused from `review-center`), a 7-bar weekly-activity chart with hardcoded heights.
- Existing patterns to reuse unchanged: `apps/web/lib/api/client.ts` (`apiFetch`), the
  `app/api/orchestrate/*/route.ts` shape for a server-side Clerk-token → Kong round trip.

## 2. The one real backend gap: AGT-08's `/latest` doesn't exist yet

`agt08_analysis/main.py`'s `GET /analysis/{clerk_user_id}/latest` docstring says it outright:

> Not yet implemented: there is no persistence layer for analysis results, so this always
> returns an empty placeholder rather than real data.

The only way to get a real result is `POST /analysis/{clerk_user_id}/run`, which is already
triggered automatically today — AGT-08's own Kafka consumer
(`agt08_analysis/consumers.py::handle_consolidation_complete`) calls it after every session
consolidates, **and each call also emits `agent.pattern.events` to Kafka as a side effect**
(`persistent_weakness`/`behavioral_risk`). Calling `POST /run` again from a page load would
recompute correctly (the read+compute step is idempotent) but would **re-emit those Kafka events**
a second time for the same underlying data, which downstream consumers aren't necessarily built
to dedup.

**Recommendation for Stage C**: don't call `POST /run` from the frontend at all. Add a small,
scoped change to AGT-08 — have `handle_consolidation_complete` persist its `run_analysis()` result
(Redis, same pattern AGT-09/AGT-10 already use, keyed `agt08:latest:{clerk_user_id}`, no TTL or a
long one) and make `GET /latest` read that instead of returning a stub. This is a backend task,
not a frontend one, and it's the one piece of this plan that isn't pure wiring.

**Status (2026-07-02): this fix is already underway** (owned elsewhere in the `agents/` stack —
don't start a second implementation of it). Treat everything AGT-08-dependent below (the
`agt08-analysis` Kong route in Stage A, the per-skill/insights work in Stage C that reads from
it) as **blocked on that landing**, and sequence Stage A/B and the rest of Stage C — none of
which touch AGT-08 — ahead of it.

## 3. Sequencing

### Stage A — Kong routes (backend, ~1-2 hours)

Do the AGT-09/AGT-10 routes first — they're unblocked today. Hold the AGT-08 route until §2's
fix lands (tracked elsewhere, already underway).

- [ ] `agt10-library` service/route: `/api/habit/library` → `agt10-habit:8110/library`, JWT.
- [ ] `agt10-streak` service/route: `/api/habit/streak` → `agt10-habit:8110/streak`, JWT, **GET
  only** — do not route the `POST .../record` endpoint through Kong (§1 — client should never
  call it).
- [ ] `agt09-recommendations` service/route: `/api/recommendations` → `agt09-
  recommendation:8109/recommendations`, JWT, GET only (the `invalidate` endpoint is
  AGT-02-to-AGT-09 internal, not client-facing).
- [ ] `agt08-analysis` service/route: `/api/analysis` → `agt08-analysis:8108/analysis`, JWT, **GET
  only**, and **only after §2's persistence fix lands** — don't expose `POST /run` publicly, since
  nothing stops a client from spamming it and duplicating Kafka emissions.
- [ ] Same IDOR concern as the AGT-03 plan's Stage D applies to every one of these — all four
  routes take `clerk_user_id` as a path param with no JWT-`sub` cross-check today. Either add that
  check agent-side, or (simpler, consistent with recommendation there) add a `/me/...` variant
  that derives the id from the decoded JWT instead of trusting the path. Pick one approach and
  apply it uniformly across AGT-08/09/10 rather than solving it differently per agent.

### Stage B — Homepage (frontend, ~half a day)

- [ ] New Next.js route handlers mirroring `app/api/orchestrate/onboarding/route.ts`:
  `app/api/habit/library/route.ts`, `app/api/habit/streak/route.ts`,
  `app/api/recommendations/route.ts`.
- [ ] `homepage/page.tsx`: fetch `/api/habit/streak` for the streak badge (replaces "12 ngày
  streak"), fetch `/api/habit/library` for the daily-tasks list (today's-plan tab → task list;
  due-for-review count → the "Ôn tập từ vựng nhanh" card's "15 từ" text becomes real).
- [ ] The AI-tutor CTA card needs no data change — leave as-is.
- [ ] The overall-progress **percentage** (currently hardcoded "68%") has **no clean backend
  source** — AGT-02's `/plans/{id}/active`/`/today` don't return a completion percentage today.
  Compute it client-side from the plan's activities (completed count / total count) if that shape
  is available once fetched, or drop the percentage for v1 and keep just the streak badge. Don't
  invent a new backend endpoint for this without confirming what AGT-02's plan response actually
  contains first.

### Stage C — Progress page (backend + frontend, ~1 day, partially blocked)

- [ ] Backend: §2's persistence fix in `agt08_analysis` — **already underway elsewhere, don't
  duplicate**. Everything below that doesn't depend on it (skill bars, activity chart) can and
  should be implemented now; only the AGT-08 "insights" bullet at the end of this stage waits.
- [ ] Per-skill target-vs-current bars: fetch `/api/profile` (new thin proxy needed — AGT-01 isn't
  exposed via Kong at all today, same Stage-A treatment as the other three), map `irt_theta` per
  skill through `theta_to_cefr` (or keep it as a raw theta-derived percentage — the current UI
  shows IELTS-band numbers like "6.5", which theta doesn't map to directly; decide the
  display unit with whoever owns the product copy before wiring, don't silently invent a
  theta→IELTS-band conversion).
- [ ] Weekly activity chart: fetch `/api/sessions` (new Kong route for AGT-06's
  `/ltm/{id}/sessions`, same IDOR treatment as Stage A) and reduce `end_time - start_time` by ISO
  weekday client-side — no new backend aggregation endpoint needed for this.
- [ ] 3-phase roadmap (Foundation/Intermediate/Advanced) — same "no clean source" situation as
  homepage's overall %; likely derived from the same learning-path-phase data once someone
  confirms what `LearningPathDto` actually contains. Flag, don't block Stage C on it — ship the
  skill bars and activity chart first.
- [ ] Optional/bonus, not in the current mock UI at all: AGT-08's `patterns`/`risk_score` data has
  no home in today's design. Worth a product conversation about adding an "insights" card (e.g.
  "You've plateaued on Listening" from `plateau_by_skill`) rather than silently dropping real,
  computed signal on the floor — call this out to whoever owns the Progress page design, don't
  build UI for it speculatively here.

### Stage D — Verification

- [ ] `docker compose up` with `agt08-analysis`, `agt09-recommendation`, `agt10-habit`,
  `agt06-memory`, `agt01-profiling`, `kong`, `redis`, `postgres-agents` running.
- [ ] Complete a real AGT-03 session (once Phase 6's plan lands) or seed `learning_sessions`
  directly, confirm the streak badge and due-for-review count move.
- [ ] Manual browser walk per the `/verify` skill standard — both pages, golden path, and the
  cold-start case (brand-new user: AGT-09 popularity fallback, AGT-10 empty-tabs tolerance, AGT-08
  `insufficient_data: true`).

## 4. Open questions (explicitly out of scope here)

- **Overall learning-path completion percentage** — no backend source confirmed; needs someone to
  check `LearningPathDto`'s actual shape (`packages/shared/src/dto/learning-materials.ts`) before
  deciding whether it's a client-side computation or a new AGT-02 field.
- **IELTS-band display vs. raw IRT theta** — a product/copy decision, not an engineering one.
- **3-phase roadmap (Foundation/Intermediate/Advanced) data source** — likely learning-path-phase
  metadata that may not exist as a distinct concept anywhere yet; needs the same shape-check as
  the completion percentage before committing to an approach.
- **AGT-08 "insights" surfacing** (`patterns`, `risk_score`, `plateau_by_skill`) — real data with
  no current UI slot; a design addition, not assumed here.
- **The same auth-scoping question raised in the AGT-03 plan's Stage D** (path-param
  `clerk_user_id` vs. deriving from the JWT) needs one consistent answer applied across AGT-01/
  06/08/09/10, not four different fixes.

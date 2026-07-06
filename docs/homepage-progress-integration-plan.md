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

**Status (2026-07-06): all of Stage A/B/C done.** §2's AGT-08 persistence fix landed, Stage A/B
landed via PR #34, Stage C landed the same day the fix did — every checklist item below is
checked off, with disposition notes on the ones that didn't ship exactly as originally scoped
(dropped roadmap/target-date, % reused rather than newly derived, IELTS-band question resolved
as CEFR bands). See `CLAUDE.local.md`'s "Recently landed" section for the full changelog. §4's
open questions are all resolved — see inline notes.

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

- [x] `agt10-library` service/route: `/api/habit/library` → `agt10-habit:8110/library`, JWT.
- [x] `agt10-streak` service/route: `/api/habit/streak` → `agt10-habit:8110/streak`, JWT, **GET
  only** — do not route the `POST .../record` endpoint through Kong (§1 — client should never
  call it).
- [x] `agt09-recommendations` service/route: `/api/recommendations` → `agt09-
  recommendation:8109/recommendations`, JWT, GET only (the `invalidate` endpoint is
  AGT-02-to-AGT-09 internal, not client-facing).
- [x] `agt08-analysis` service/route: `/api/analysis` → `agt08-analysis:8108/analysis`, JWT, **GET
  only**, and **only after §2's persistence fix lands** — don't expose `POST /run` publicly, since
  nothing stops a client from spamming it and duplicating Kafka emissions.
- [x] Same IDOR concern as the AGT-03 plan's Stage D applies to every one of these — all four
  routes take `clerk_user_id` as a path param with no JWT-`sub` cross-check today. Either add that
  check agent-side, or (simpler, consistent with recommendation there) add a `/me/...` variant
  that derives the id from the decoded JWT instead of trusting the path. Pick one approach and
  apply it uniformly across AGT-08/09/10 rather than solving it differently per agent.
  **Resolved 2026-07-06**: `agents.shared.auth.require_matching_user` (403s on a `sub`/path
  mismatch) applied agent-side to all of AGT-09/10 (PR #34) and AGT-08 (2026-07-06). AGT-01/AGT-06
  (added later, for Stage C) used the "separate route" variant instead — new
  `GET /summary/{clerk_user_id}` on each, guarded, deliberately apart from their pre-existing
  internal routes (`/profile/*`, `/ltm/*`) which stay ungated since other agents call those
  directly without a user JWT.

### Stage B — Homepage (frontend, ~half a day)

- [x] New Next.js route handlers mirroring `app/api/orchestrate/onboarding/route.ts`:
  `app/api/habit/library/route.ts`, `app/api/habit/streak/route.ts`,
  `app/api/recommendations/route.ts`.
- [x] `homepage/page.tsx`: fetch `/api/habit/streak` for the streak badge (replaces "12 ngày
  streak"), fetch `/api/habit/library` for the daily-tasks list (today's-plan tab → task list;
  due-for-review count → the "Ôn tập từ vựng nhanh" card's "15 từ" text becomes real).
- [x] The AI-tutor CTA card needs no data change — leave as-is.
- [x] The overall-progress **percentage** (currently hardcoded "68%") has **no clean backend
  source** — AGT-02's `/plans/{id}/active`/`/today` don't return a completion percentage today.
  Compute it client-side from the plan's activities (completed count / total count) if that shape
  is available once fetched, or drop the percentage for v1 and keep just the streak badge. Don't
  invent a new backend endpoint for this without confirming what AGT-02's plan response actually
  contains first.
  **Resolved**: computed client-side from `todaysPlan[0].activities` completed/total, exactly as
  scoped here. Progress page's Stage C % reuses this same computation/endpoint rather than
  deriving a separate lifetime-completion metric that doesn't exist anywhere (see Stage C below).

### Stage C — Progress page (backend + frontend, ~1 day, partially blocked) — ✅ done 2026-07-06

- [x] Backend: §2's persistence fix in `agt08_analysis` — landed 2026-07-06 (PR "worktree-agt08-
  persistence-fix"). Everything below then implemented the same day.
- [x] Per-skill target-vs-current bars: fetch `/api/profile` (new thin proxy — but not to AGT-01's
  existing `/profile/{id}`; a new guarded `GET /summary/{id}` was added instead, see Stage A's
  IDOR resolution note above), map `irt_theta` per skill through `theta_to_cefr`.
  **Display-unit decision**: CEFR bands (A1–C2), not IELTS numbers — no theta→IELTS-band
  conversion was invented; Speaking shows "Chưa đánh giá" since its theta is always null (never
  CAT-assessed).
- [x] Weekly activity chart: fetch `/api/sessions` (same "new `/summary` route" pattern as
  AGT-01 above, on AGT-06) and reduce `end_time - start_time` by ISO weekday client-side.
  **Caveat found while wiring, not part of the original scope**: `learning_sessions.start_time`/
  `end_time` are both stamped at consolidation time (session end), not at actual session start —
  `create_session()` is only ever called from `consolidation.py`'s `consolidate_session()`. Bars
  render correctly but every session currently has ~0 duration. See `CLAUDE.local.md`'s "Known
  issues" for the real fix (an AGT-03 session-start hook), not yet scheduled.
- [x] 3-phase roadmap (Foundation/Intermediate/Advanced) — **dropped entirely**, not deferred.
  Confirmed no backend concept of learning phases or a target date exists anywhere (checked
  `LearningPathDto` and AGT-02's `agent_learning_plans` table) — this needs real schema/design
  work, not wiring, so nothing was invented in its place.
- [x] AGT-08 insights card — built. Shows plateau-by-skill and CUSUM persistent-error patterns,
  hidden entirely when there's no signal (matches the "don't silently drop it, but don't force a
  UI when there's nothing to show" spirit of this bullet).

### Stage D — Verification — ✅ done 2026-07-06

- [x] `docker compose up` with `agt08-analysis`, `agt09-recommendation`, `agt10-habit`,
  `agt06-memory`, `agt01-profiling`, `kong`, `redis`, `postgres-agents` running.
  **Found along the way**: the already-running `agt01-profiling`/`agt06-memory`/`agt08-analysis`
  containers were stale (built before that day's fixes — Docker doesn't hot-reload). Rebuilt all
  three + restarted Kong before this stage could pass.
- [x] Verified against real Postgres data for a real user (not a freshly seeded one): 401 with no
  token, 403 with a mismatched user, 200 with real theta/session/analysis data on all three new
  endpoints, hit directly (bypassing Kong, whose JWT plugin needs a real Clerk-signed token this
  environment can't mint from the CLI).
- [ ] Full logged-in browser walk through `main/progress` was done by the human developer, not the
  agent that built this (no browser-automation tooling or Clerk credentials available in that
  session) — confirmed working, including the empty-insights-card cold-start case.

## 4. Open questions (explicitly out of scope here) — all resolved 2026-07-06

- **Overall learning-path completion percentage** — ~~no backend source confirmed~~. **Resolved**:
  `LearningPathDto` has no completion field; reused the homepage's existing today's-plan
  completed/total computation instead of inventing a new lifetime metric.
- **IELTS-band display vs. raw IRT theta** — ~~a product/copy decision~~. **Resolved**: CEFR bands.
- **3-phase roadmap (Foundation/Intermediate/Advanced) data source** — ~~needs a shape-check~~.
  **Resolved**: confirmed no such concept exists in `LearningPathDto` or AGT-02's schema; dropped
  the roadmap section rather than fabricate one.
- **AGT-08 "insights" surfacing** — ~~a design addition, not assumed here~~. **Resolved**: built,
  hidden entirely when there's no plateau/pattern/risk signal.
- **The same auth-scoping question raised in the AGT-03 plan's Stage D** — **Resolved**: applied
  uniformly. AGT-08/09/10 guard their existing per-user routes directly with
  `require_matching_user`; AGT-01/06 (whose equivalent routes are also called agent-to-agent
  without a user JWT) instead got new, separate `GET /summary/{clerk_user_id}` routes carrying the
  same guard, leaving the internal-use routes ungated and un-Kong-routed.

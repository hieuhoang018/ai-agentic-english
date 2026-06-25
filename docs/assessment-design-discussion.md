# Assessment questions: current state and open design questions

**Status as of 2026-06-24**: discussion started, no decisions made yet. This is about the CEFR
placement/assessment feature (`AssessmentQuestion` table, `assessmentScorer.ts`,
`POST /assessment/score`) — a different thing from `docs/learning-materials-content-roadmap.md`'s
curriculum content (`Module`/`Lesson`/`Exercise`), though both live in
`learning-materials-service`.

## Current state (confirmed by reading the code, 2026-06-24)

**It's fully disconnected from the rest of the product, not just architecturally separate.**
Grepped for callers: zero references to assessment anywhere in `agents/agt_orchestrator/main.py`
(the actual onboarding flow today) or `apps/web/src`. So right now this is an orphaned backend
capability — it works in isolation, but nothing in the live onboarding pipeline calls it, and its
output isn't persisted anywhere (no `LearnerModel`, no AGT-01 profile update).

What exists:
- `AssessmentQuestion` Prisma model (`id`, `skill`, `cefrLevelTarget`, `prompt`, `correctAnswer`,
  `order`) — `services/learning-materials-service/prisma/schema.prisma`.
- `GET /assessment/questions` (optionally filtered by `?skill=`) and `POST /assessment/score` —
  `services/learning-materials-service/src/routes/assessment.ts`.
- `scoreAssessment()` — `services/learning-materials-service/src/scoring/assessmentScorer.ts` —
  a pure function: takes submitted answers + the matching questions, returns
  `AssessmentResultDto` (`{ levels: Partial<Record<Skill, CefrLevel>>> }`). No side effects, no
  persistence — caller gets the result back and that's the end of the road today.

## A real quirk in the current scoring logic

```ts
for (const level of CEFR_LEVELS) {       // A1 → C2, in fixed order
  const bucket = byLevel[level];
  if (!bucket) continue;
  if (correct / bucket.length >= SCORING_THRESHOLD) {  // 0.6
    highestPassing = level;              // overwrites, never breaks
  }
}
```

This does **not** gate sequentially. It checks every CEFR level's question bucket independently
and keeps whichever passing level is highest — it does not stop climbing at the first failed
level. Concretely: a learner who fails the A2 bucket but happens to pass the B1 bucket (by
scoring ≥60% on whatever B1 questions exist) ends up with `highestPassingLevel: B1`, having
never actually cleared A2.

This may or may not be the intended behavior — "once a user passes a certain level, it becomes
their highestPassingLevel" reads naturally as **sequential gating** (climb until you fail, stop
there), but the code as written is closer to **independent-bucket scoring** (take the highest
level that independently cleared the threshold, regardless of what happened below it). These
produce different results whenever a learner's performance isn't monotonically decreasing by
level — not a hypothetical edge case, plausibly common (e.g. a vocab-heavy A2 bucket trips
someone up while a topic they happen to know well carries a B1 bucket).

## Open questions — now resolved, see Decisions below

1. **Sequential gating vs. independent-bucket scoring** — which is actually intended? This is
   the core fix-or-keep decision; everything else is secondary to it.
2. **Per-skill or overall?** Current code computes `highestPassingLevel` separately per skill
   (reading/writing/listening/speaking each get their own). Confirm this is the goal, vs. a
   single overall level.
3. **Lifecycle/purpose** — is this a one-time placement step at onboarding (compute once, set a
   starting point, never revisit), or something a learner can retake later (e.g. periodic
   re-assessment as they improve, requiring a stored history rather than a single snapshot)?
4. **What "entirely separate from learning materials" means precisely** — already true at the
   data level (`AssessmentQuestion` is a distinct table from `Exercise`, distinct content, no FK
   between them). Open question is whether "separate" should go further: a different service
   entirely, or staying in `learning-materials-service` but with a firmer conceptual line (e.g.
   never reusing `Exercise`/`Module` content as assessment items, which is already the case
   today — `AssessmentQuestion` rows are hand-written separately in `seed.ts`, never derived from
   `Module`/`Lesson`/`Exercise`).
5. **What consumes the result once computed** — needs an actual integration point decided (most
   likely candidates: `agt_orchestrator`'s onboarding chain, so a placement result can seed
   AGT-02's initial CEFR level / skill allocation, similar to how `AGT01` profile / `irt_theta`
   feeds path generation today). Currently nothing wires this in either direction.

## Decisions (2026-06-24)

Discussed question-by-question; this team's scope is the TS side
(`learning-materials-service`) only — the Python `agents/` stack (`agt_orchestrator`, AGT-01,
AGT-02) is the AI engineer's responsibility, so decisions below stop at the contract boundary
and don't prescribe what the orchestrator/agents do internally.

1. **Sequential gating — confirmed and implemented (2026-06-24).** `scoreAssessment()`'s loop
   now stops climbing at the first CEFR level (per skill) that fails the 60% threshold, instead
   of checking every level independently and keeping the highest one that happens to pass. A
   bucket with no questions for a given level (no data, not a failure) is still skipped over via
   `continue` — only an actual sub-threshold score `break`s the loop. Fixed in
   `services/learning-materials-service/src/scoring/assessmentScorer.ts`; regression test added
   in `src/__tests__/assessment.test.ts` ("uses sequential gating — failing A2 caps the result at
   A1 even if B1 passes"). 10/10 tests pass, lint clean.
2. **Per-skill — confirmed, keep as-is.** `levels` stays `Partial<Record<Skill, CefrLevel>>`,
   one entry per skill. No overall/aggregate scalar is being added — if something later needs a
   single number (e.g. a UI badge), that should be a derived aggregation computed at the point
   of need, not a change to what `scoreAssessment()` stores.
3. **Lifecycle — one-time placement at onboarding.** No retake/history feature, no new
   `AssessmentAttempt`-style table. Ongoing level changes are expected to come from the
   learner's actual performance signal over time (attempt tracking / progress), not from
   re-running the placement quiz. A "recalibrate me" retake feature could be designed later if
   wanted, but it's an explicit future feature, not part of this scope.
4. **Separation — already satisfied, no service split.** "Entirely separate from learning
   materials" means content-level separation only: assessment questions are their own
   hand-written set and must never overlap with or be derived from `Exercise`/`Module` content.
   This is already true today (`AssessmentQuestion` rows are hand-written in `seed.ts`,
   independent of curriculum content) — no service boundary change, no schema change needed.
5. **Consumer / integration point — contract boundary only.** Per the onboarding flow described
   in `README.md` §8.2.1 ("Assessment module chấm điểm xác định, trả về ước lượng trình độ"),
   the assessment result must be computed deterministically server-side and only the *derived
   skill levels* — never raw answers — should reach anything LLM-driven downstream. From this
   team's side, that means: `POST /api/assessment/score` (already public via Kong, already
   returns the right shape) needs no change. The PWA is expected to call it first, then forward
   the resulting `levels` (same shape as `AssessmentResultDto.levels`) into whatever onboarding
   call reaches `agt_orchestrator` (today, `POST /api/orchestrate/onboarding`), as a new field
   alongside the existing `currentLevel`/`goals`/`dailyTimeBudgetMinutes`. What field name the
   orchestrator's `OnboardingRequest` ends up using, and what it does with the value internally
   (CEFR→theta conversion, whether it seeds AGT-01's `irt_theta` directly vs. only AGT-02's
   already-built-but-unused `skill_estimates` overlay) is the AI engineer's call, not this team's
   — flagged here only so the field-name handshake happens, not to prescribe the Python side.

## Question bank design — resolved and implemented (2026-06-24)

Found while preparing to implement decision 1: the seeded `AssessmentQuestion` data was
hand-written placeholder content predating Phase 9's real content work (vocab spine, grammar
primitives, VOA passages/audio), capped at A1-A2-B1 (no learner could ever place above B1
regardless of ability) and with listening items tested as read transcripts (no actual audio,
no `audioKey` field on the table).

**Discussed and decided**: cap the placement test at **B2** (not C1/C2 — onboarding should be
quick, and few learners realistically need C-level placement at intake) and settled the
items-per-level count via the scoring threshold's math, not just total test length:

- At `SCORING_THRESHOLD = 0.6`, **N=2 items/level is structurally unusable** — only 3 possible
  scores exist (0, 0.5, 1), so the threshold collapses to either "both correct required" (any
  single slip fails the level) or "1 of 2 passes" (≈44% false-pass rate from pure MCQ guessing,
  `1 − 0.75²`). Neither is acceptable.
- **N=3 is the practical floor**: passing requires 2/3 (67%), tolerating one miss while keeping
  the guess-through false-pass rate low (≈16% for 4-option MCQ, `C(3,2)(0.25)²(0.75) + 0.25³`).
- Landed on **N=3 per level, 4 levels (A1/A2/B1/B2), 3 skills (reading/writing/listening — no
  speaking per the decision below)** = **36 questions total, 12 per skill**, ~6-9 minutes at
  typical per-item pace. Threshold tuning alone (lowering/raising 0.6) cannot substitute for
  having enough items per level — it was considered and rejected as a way to keep N=2 viable.

**Noted but not adopted**: true onboarding-time savings (skip a learner past lower levels they'd
obviously pass) would require stage-based/adaptive delivery — fetch one level's bucket at a
time, only fetch the next if the previous passes — instead of today's single-shot
fetch-everything-then-score model. That's an architecture change (multi-round-trip flow), not a
content change, and was explicitly deferred as a separate future decision, not bundled into this
content refresh.

**Implemented**: `prisma/seed.ts`'s assessment question block extended with 9 new B2 questions
(3 reading, 3 writing, 3 listening — `aq-{r,w,l}-b2-{1,2,3}`, order 10-12 per skill), bringing the
total from 27 to 36. Listening items remain plain-text transcripts for now — the no-audio gap is
unchanged and still tracked separately below, since fixing it requires schema work
(`audioKey`/`mediaAssetId` on `AssessmentQuestion`) and content sourcing (e.g. reusing Phase 9's
VOA passage/audio pipeline), neither of which was in scope for this item-count pass.

**Listening audio — implemented (2026-06-24).** All 12 listening questions now have real,
verified-playable audio, sourced via a new ETL script
(`agents/tools/assessment_listening_etl.py`) rather than written-then-matched: VOA Special
English's "Words and Their Stories" archive (mirrored with plain-text transcripts at
manythings.org/voa/words/, same public-domain basis as `voa_passages_etl.py` — 17 U.S.C. §105),
audio-first, real transcript quoted directly into each question (no fabricated transcript
text). These are different episodes/audio files from the modern "Words and Their Stories"
series already used for Passages, so no overlap with curriculum content (decision 4 still
holds). No schema change was needed: following the same pattern already established for
`Exercise`'s listening-comprehension `audioKey` (embedded in the `prompt` JSON blob, not a
dedicated column — confirmed by reading `prisma/seed.ts`'s existing generated-content rows),
each listening question's `prompt.audioKey` now points at a real object in a new dedicated
`assessment-audio` MinIO bucket (added to `infra/docker-compose.yml`'s `minio-init-agents` job).

Level assignment caveat, same honesty as Phase 9B's passage-level note: the vocab-spine CEFR
heuristic saturates at A2 for nearly this entire archive (intentionally-simplified-vocabulary
idiom-explainer content by design), so levels here were assigned by ranking a larger sample by
avg sentence/word length (a complexity proxy) and picking the 3 simplest for A1 through the 3
most complex for B2 — meaning even the "A1" tier is the simplest available in this corpus, not
genuinely beginner audio. Listening comprehension difficulty is further differentiated by the
question itself: all are direct-recall paraphrase questions (appropriate for a placement test),
with the underlying vocabulary/idiom getting more specialized at higher tiers (e.g. "flat broke"
at A1 vs. "GI" military jargon at B2).

Verified for real: all 12 mp3s downloaded from their real source URLs, uploaded to MinIO, and
spot-checked via presigned URL + `file` (confirmed valid MPEG audio, not error pages) at both the
A1 and B2 tiers. Re-seeded against real Docker Postgres (existing assessment rows had to be
truncated first — `seed.ts`'s upsert is create-only, `update: {}`, so it never updates
already-existing rows by design; this was a one-time manual step for this content refresh, not a
code change). 36/36 questions confirmed in Postgres with correct per-level/skill counts; all 39
service tests still pass; `tsc --noEmit` clean.

## Decision: speaking is no longer assessed (2026-06-24)

The placement assessment will not test `speaking` going forward. This formalizes existing
reality rather than changing anything — zero `speaking` rows have ever existed in
`AssessmentQuestion`'s seed data. No schema or shared-type change needed: `Skill` in
`packages/shared/src/dto/learning-materials.ts` keeps all four values (`reading`/`writing`/
`listening`/`speaking`) unchanged, since `speaking` is actively used elsewhere for real-time
speaking *practice* (AGT-02 path generation, AGT-03 tutor, AGT-04 feedback) — unrelated to this
placement *assessment* feature.

**Flagged implications, not yet resolved:**

- **Downstream consumers get no speaking estimate at onboarding, ever.** Per decision 5's
  contract, whatever reads the assessment result (eventually AGT-01's `irt_theta` or similar)
  will simply never see a `speaking` key in `levels`. Needs confirming with the AI engineer that
  this is acceptable — i.e. initial speaking proficiency comes from self-report/default only,
  with a real signal arriving later from the learner's first AGT-03 speaking session, not from
  placement.
- **Not enforced in code yet.** `GET /assessment/questions?skill=` (`assessment.ts:14`) accepts
  any string with no enum validation — so "we don't assess speaking" is currently a content
  choice (no rows exist), not a guarded invariant. Could add validation later to reject
  `skill=speaking` outright if the decision should be locked in code, not just in what happens to
  be seeded. Not done now — not required for the scoring fix.

## Content moved to seed-data + dedicated loader (2026-06-24)

Following the same pattern as vocab/grammar/passages: all 36 assessment questions extracted out
of `prisma/seed.ts`'s inline array into `prisma/seed-data/assessment_seed.jsonl` (one JSON object
per line, snake_case top-level keys matching the other seed files' convention), loaded by a new
`prisma/seedAssessment.ts` (`npm run seed:assessment`). `seed.ts` no longer seeds assessment
questions at all — it now only does Modules/Lessons/Exercises (the small hand-written curriculum
scaffold).

One real improvement over the old inline approach: `seedAssessment.ts` upserts with a real
`update` clause (`where: { id }`, update all fields), unlike `seed.ts`'s `update: {}` no-op
pattern used for the rest of the file. This means future content edits to
`assessment_seed.jsonl` take effect on a normal re-run — no more needing to manually `TRUNCATE`
the table first, which was required during this session's audio work specifically because the
old inline upsert never updated existing rows.

Extraction was done programmatically (parsed and evaluated the existing array literal out of
`seed.ts`, not hand-transcribed) to avoid introducing transcription errors into 36 already-
verified records. Verified for real: re-ran the full pipeline against Docker Postgres
(`seed` → 0 assessment rows, `seed:assessment` → 36, re-run idempotent, all `audioKey`s and
counts intact); 39/39 tests pass; lint clean.

**Getting the actual audio on a new machine**: pulling `assessment_seed.jsonl` from git and
running `seed:assessment` only gives you correct Postgres rows — the mp3s themselves live in
MinIO, which is per-machine, not synced. See `infra/README.md`'s "MinIO-backed audio content"
section for the (current, per-machine) fix: re-run `agents/tools/assessment_listening_etl.py`
locally, which re-fetches from the real public VOA source and re-uploads to whichever MinIO your
machine points at.

**Flagged**: `assessment_seed.jsonl` falls under the same pre-existing `.gitignore` blanket rule
(`**/seed-data`, see Known issues in `CLAUDE.local.md`) already blocking
`vocab_seed.jsonl`/`grammar_seed.jsonl`/`passage_seed.jsonl`/`generated_content_seed.jsonl` from
ever being committed. Not fixed here since it's a pre-existing issue affecting 4 other files,
not something this change introduced — but it means this content won't reach git either until
that rule is scoped down.

## Next steps (not yet done)

- Coordinate with the AI engineer on (a) the new onboarding request field name/shape so the PWA
  can forward assessment results into `/api/orchestrate/onboarding`, and (b) confirming the
  no-speaking-at-onboarding implication above is acceptable on their side.
- Optionally add skill-enum validation to `/assessment/questions` if the no-speaking decision
  should be enforced in code rather than left as "no rows exist."
- Optionally revisit stage-based/adaptive delivery if onboarding speed becomes a concern beyond
  what the 36-question single-shot form already gives.
- The PWA-facing client needs to actually play `prompt.audioKey` for listening questions (fetch
  a presigned MinIO URL, same retrieval pattern already used for Passage audio) — out of scope
  for this backend pass, flagged for whoever picks up the assessment UI.

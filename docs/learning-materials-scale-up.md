# Learning Materials: scaling up beyond the Phase C pilot batch

**Status as of 2026-06-24**: open, not started. This is a follow-up to
`docs/learning-materials-content-roadmap.md` Phase C — read that first for how generation
actually works (atomic exercises, deterministic grouping, `agents/tools/content_gen_etl.py`).
This doc only covers what's needed to go from the current pilot batch to broader coverage.

## Current state (catalog as of 2026-06-24)

6 modules / 19 lessons / 73 exercises total — 3 hand-written (`prisma/seed.ts`) + 3 LLM-generated:

| Skill | Hand-written module | Generated module | CEFR levels covered |
|---|---|---|---|
| Reading | `mod-reading-a2` | `mod-gen-reading-a2` | A2 only |
| Writing | `mod-writing-b1` | `mod-gen-writing-b1` | B1 only |
| Listening | `mod-listening-a2` | `mod-gen-listening-a2` | A2 only |
| Speaking | — | — | none (explicitly out of scope, see roadmap) |

Each skill has exactly one generated module at exactly one CEFR level. The question this doc
answers: what does it take to add more modules and more levels per skill.

## Per-skill scaling path

### Writing — unblocked, scale anytime

The grammar spine (Phase A, `GrammarPoint`) already covers **A1–C2** (292 points across all six
levels). Extending writing is purely a config change in `agents/tools/content_gen_etl.py`:

- Add more entries to `WRITING_BATCHES` with different `cefr_level` values (e.g. `"A2"`, `"B2"`).
- Or raise `grammar_limit`/`exercises_per_grammar_point` on the existing B1 entry for more depth
  at the same level.
- Re-run `python -m agents.tools.content_gen_etl` → review JSONL diff → `npm run seed:generated`.
  Same idempotent flow already in place; nothing structural to build.

No new sourcing, no schema changes, no blocked dependency. This is the cheapest lever to pull.

### Reading — content-volume scaling is free, level diversity is not

More reading *content* at A2 (or B1, the 2 outlier passages) is free: raise `passages_limit` in
`READING_BATCHES`, or add a second batch entry pointed at a different `passages_offset` slice of
the pool — same data, same scraping cost already paid.

**Genuine A1 or C1+ reading content is blocked on sourcing**, not generation. VOA's "Words and
Their Stories" series (the only passage source so far) is leveled "intermediate/upper-beginner"
by VOA itself regardless of topic — the CEFR heuristic (85th-percentile vocab-spine level among
matched words) has nowhere else to land, which is why 24 of 26 passages came out A2 even after
hand-picking 14 more articles across very different topics. Two real options:

1. **A different VOA tier**: VOA Learning English publishes separate "Level 1/2/3" content
   tracks aimed at different proficiencies — not yet explored, would need its own scrape-and-verify
   pass like Phase B's (expect the same friction: verify `class="wsw"` + a real `.mp3` link exist
   per article before trusting any URL, since not every page on the site carries the rich
   transcript template — see Phase B's "expanded 2026-06-24" note in the roadmap for what that
   verification loop actually looked like).
2. **LLM-generate original passages** instead of scraping, targeting a specific CEFR level
   directly in the prompt rather than relying on a heuristic after the fact. Loses the "real VOA
   public-domain content" provenance Phase B was built around, but sidesteps the leveling problem
   entirely. Reading doesn't need paired audio, so this option has no further dependency.

### Listening — same passage-sourcing constraint, plus a real audio production gap

Everything in Reading's section applies (listening exercises are generated from the same
`Passage` rows). On top of that, **getting listening content at a new CEFR level requires real
audio**, and:

- If sourced from VOA's other level tiers (option 1 above): audio comes for free, same as Phase
  B — VOA episodes ship with real narration mp3s, `voa_passages_etl.py` already knows how to
  fetch + upload them to MinIO.
- If LLM-generating original passages (option 2 above): there is **no TTS anywhere in this
  codebase** (TS mock or Python) — a pre-existing, unrelated gap (see `CLAUDE.local.md` Known
  Issues), originally blocking AGT-03 real-time speech. A synthetic passage with no source
  narration has nothing to narrate it into audio. This means LLM-generated original passages are
  a *reading-only* option until TTS exists somewhere — don't pick option 2 for a new CEFR level
  if listening coverage at that level matters too.

### Speaking — fully out of scope, unchanged

No primitive, no generator, intentionally not addressed by any of this. Blocked on the same TTS
gap (plus AGT-03 conversation logic), tracked separately. Not part of this scale-up effort.

## Suggested order, if/when picked back up

1. **Writing** first — no blockers, multiple levels in one session.
2. **Decide the reading/listening sourcing question** (VOA Level 1/2/3 scrape vs. LLM-generated
   originals) — this is a real fork, not a default; the TTS gap makes the choice consequential
   for listening specifically, so decide it explicitly rather than defaulting to whichever is
   easier to start.
3. **Reading** at the new level(s), using whichever sourcing answer came out of step 2.
4. **Listening**, only if step 2's answer actually produced audio (VOA route) — otherwise listening
   stays capped at today's two levels until TTS exists.

## Vocabulary exercises — open question, not started

The vocab spine (Phase 0, `VocabEntry`/`VocabSense`/`VocabPron`, 7,798 words) is seeded but
**currently unused by generation** — `content_gen_etl.py` only consumes grammar (writing) and
passages (reading/listening). Adding vocab-grounded exercises (e.g. "choose the correct
definition," "pick the synonym," "fill in the blank with the right word from this list") raises
a real fork: does vocabulary become a 5th `skillFocus` value, or do vocab-grounded exercises get
filed under one of the existing 4 skills?

**This isn't just a taxonomy preference — there's a concrete compatibility issue.**
`agents/agt02_learning_path/service.py`'s `_SKILL_FOCUS_TO_CODE` hardcodes exactly the CEFR four
macro-skills:
```python
_SKILL_FOCUS_TO_CODE = {"listening": "L", "speaking": "S", "reading": "R", "writing": "W"}
```
and `_modules_to_skill_catalog` **silently skips** any module whose `skillFocus` doesn't match
one of those 4 (`if not skill: continue`). A `mod-gen-vocab-*` module with `skillFocus:
"vocabulary"` would be seeded and servable via the REST API, but **invisible to AGT-02's daily
learning-path optimizer** — it would never get scheduled into anyone's plan — unless that
mapping is updated in lockstep.

### Option A — new 5th `skillFocus` value (`"vocabulary"`)

- **Pros**: clean separation; accurate per-skill progress tracking (a learner's "reading" score
  doesn't get diluted by pure vocab-recall questions that aren't really testing reading
  comprehension); matches that vocab already has its own dedicated, currently-idle primitive,
  same one-primitive-per-skill pattern reading/writing/listening already follow.
- **Cons**: `Skill` in `packages/shared/src/dto/learning-materials.ts` is currently a closed
  union (`'reading' | 'writing' | 'listening' | 'speaking'`) modeled directly on the CEFR
  four-macro-skills framework this whole curriculum's `cefrLevel`/`skillFocus` columns are built
  around — vocabulary isn't a CEFR macro-skill, it's a sub-component normally assessed *through*
  the other four. Requires updating `_SKILL_FOCUS_TO_CODE` (and anywhere else that pattern-matches
  on the 4 known skill strings — worth a repo-wide grep before committing to this option, AGT-02
  is just the one instance already found) so vocab modules are actually reachable by the
  optimizer, not just servable via REST.

### Option B — fold into an existing skill (most naturally `"reading"`)

- **Pros**: zero schema/type changes, zero AGT-02 changes, works today. Vocab-in-context and
  definition-matching exercises are arguably a flavor of reading comprehension anyway (a learner
  reads a short context/sentence to determine word meaning), so this isn't a stretch — same
  reasoning already applied to grammar, which grounds *writing* exercises rather than getting its
  own skill.
- **Cons**: muddies the skill-specific progress signal slightly (a "reading" module could mix
  passage-comprehension and pure-vocab-recall items); a learner or analytics view filtering by
  skill can't cleanly separate "struggling with vocab" from "struggling with reading comprehension."

### A separate sub-decision either way: exercise type

Regardless of which skill bucket vocab exercises live under, genuine vocab-drill formats
(definition-matching, synonym/antonym selection) don't fit any of today's 4 `ExerciseType` values
(`mcq`, `fill-blank`, `sentence-correction`, `listening-comprehension`) particularly well — `mcq`
is the closest fit (e.g. "which definition matches this word?" as a 4-option question) and could
probably be reused as-is without a new `ExerciseType`, but worth confirming once real prompts are
being designed rather than assuming.

**No recommendation locked in** — Option B is the lower-friction default if this needs to ship
without touching AGT-02, but Option A is the more correct long-term shape if vocab progress
tracking ever matters on its own. Revisit when actually building this.

## Out of scope for this doc

- Building TTS itself — that's AGT-03/speaking territory, not a Learning Materials concern.
- A formal multi-level curriculum sequencing design (e.g. how a learner actually progresses
  A1→C2 across modules) — this doc is about *having* content at more levels, not about path
  sequencing, which is AGT-02's job (`agt02_learning_path/optimizer`).

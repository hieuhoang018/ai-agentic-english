# Learning materials content roadmap: vocab, grammar, passages/audio, exercise generation

**Status as of 2026-06-23**: Phase 0 (vocab spine), Phase A (grammar primitives), and Phase B
(reading passages + listening audio — pilot batch) done. Phase C below is planned, not yet
built. This doc is a sub-plan inside the broader server-side implementation — see
`CLAUDE.local.md` Current Status for where this fits relative to the rest of the roadmap
(offline sync, etc.). Nothing here changes the architecture split documented there.

## Why this exists

Learning Materials Service's `Module`/`Lesson`/`Exercise` tables hold 27 hand-written rows
(`prisma/seed.ts`) — fine as a smoke-test fixture, not a real curriculum. The product needs real
content across all four skills (reading, listening, writing, speaking) plus the vocab/grammar
primitives that ground it. The chosen approach is **hybrid**: seed permissively-licensed
reference primitives once (vocab, grammar, passages), then **generate** the actual
exercises/drills with our own self-hosted LLM grounded on those primitives — because open
exercise datasets usable for a commercial product barely exist (RACE/CLOTH etc. are
research-licensed only), but open *reference* data (CEFR-J, WordNet, ipa-dict, VOA Learning
English) is abundant and commercially safe.

## Licensing posture (applies to every phase)

Cost gradient that matters is *obligations*, not price:
- **Public domain / CC0 / WordNet / MIT**: zero obligations — ship freely.
- **CC BY**: cheap — one credits-page line.
- **CC BY-SA (copyleft)**: the real trap — share-alike can attach to a derivative *database*,
  awkward for a proprietary dataset.

**Rule**: anything stored and shipped as a primitive comes from PD / CC0 / permissive / CC BY
only. CC BY-SA sources (e.g. Octanove C1/C2, Wiktionary, Simple Wikipedia) are LLM **grounding
input only**, never redistributed as our own dataset. Every primitive row carries `source` +
`license` columns so this boundary is auditable, and seed loaders enforce a license allow-list
(`ALLOW_SHARE_ALIKE` env var, default off) — see `prisma/seedVocab.ts` for the reference
implementation.

## Actor flow (applies to every phase below)

```
generate (Python, offline, LLM via agents/shared/llm/router.call_llm)
   → review (human, git diff on the generated JSONL)
   → store (TS Prisma loader script → Postgres, idempotent upsert by natural key)
   → serve (Learning Materials Service's existing REST API, unchanged)
   → retrieve/sequence (AGT-02 at runtime — GETs only, never generates)
```

Key constraints this flow encodes:
- **MinIO stays Python-only.** No Node/TS service has ever used MinIO/S3 (the only client in the
  repo is Python `boto3` in `agents/agt06_memory/object_store.py`). Any phase needing binary
  audio assets has a Python step do the fetch/generate + upload; TS only ever stores the
  resulting object key as a plain string column.
- **All LLM calls go through `agents/shared/llm/router.call_llm`.** TS code has no inference
  layer of its own (removed in the Phase 6-TS cutover) and must not gain one back for this.
- **Generation is a manually-triggered batch job, not a continuous pipeline.** Run once to
  populate a first real curriculum, then re-run on demand (new level/topic/skill, more exercises
  for an existing lesson) whenever more content is wanted. Because loaders are idempotent
  upserts, repeated runs accumulate content rather than replacing it.
- **Review is git, not a moderation UI.** Generation scripts write a JSONL file as a normal
  commit/PR artifact; a human reviews the diff (CEFR-accuracy, answer-key correctness) before the
  loader runs against a real environment. No moderation tooling built for this pass — revisit if
  generation volume outgrows what git review can handle.
- **Seeding pattern is uniform across primitives**: offline data-prep (Python ETL or generation
  script) → JSONL committed to git → idempotent TS Prisma loader (`prisma/seed<Thing>.ts`, upsert
  by natural key, replace-children-on-conflict). No new internal HTTP mutation endpoints on
  Learning Materials Service — these scripts use Prisma in-process, same as `prisma/seed.ts`.

## Phase 0 — Vocab spine (✅ done)

`VocabEntry` / `VocabSense` / `VocabPron` in `services/learning-materials-service/prisma/schema.prisma`.
7,798 CEFR-leveled English words (A1–B2) loaded by default from CEFR-J Wordlist v1.5 + WordNet
(definitions/examples/synonyms) + ipa-dict en_US (IPA); +1,979 Octanove C1/C2 words available
behind `ALLOW_SHARE_ALIKE=true` (CC BY-SA, off by default).

Files: `prisma/etl/vocab_etl.py` (offline ETL, not run in CI), `prisma/seed-data/vocab_seed.jsonl`
(committed), `prisma/seedVocab.ts` (idempotent Prisma loader, `npm run seed:vocab`). Verified
end-to-end against real Docker Postgres: correct counts on first run, no duplicates on re-run,
lint/build/test green (33/33 tests).

## Phase A — Grammar primitives (✅ done)

`GrammarPoint`/`GrammarExample` added to `services/learning-materials-service/prisma/schema.prisma`
(migration `20260623031915_add_grammar_primitives`), same source repo as CEFR-J/Octanove
(`github.com/openlanguageprofiles/olp-en-cefrj`), CEFR-J Grammar Profile v20180315 (free for
research/commercial use with citation — same license family as the vocab spine's CEFR-J entries,
so it passes the default license gate without `ALLOW_SHARE_ALIKE`).

The source CSV turned out messier than vocab's: of 500 rows, ~365 are concrete instantiated forms
(e.g. "I am not" tagged `NEG. DEC.`) and ~135 are abstract construct names with no Sentence Type
and no example text (e.g. "TENSE/ASPECT: PRESENT PERFECT", "PASSIVE: PAST", "CONDITIONAL: THIRD")
— these are still real, important grammar points (tenses, passive voice, conditionals, relative
clauses), just named rather than exemplified, so the ETL keeps them with an empty `examples` list
rather than fabricating a fake example sentence from the label. Only a 13-row hand-reviewed
blocklist of genuinely content-free umbrella terms (e.g. bare "PREPOSITIONS", two literal
dangling-colon data anomalies) is dropped, plus 89 rows with no resolvable CEFR level from any of
the four frameworks the source provides (CEFR-J Level, with a same-row fallback chain through
Core Inventory → EGP → GSELO when CEFR-J Level itself is blank). `category` is derived from the
46-way Shorthand Code prefix (`PP`→pronoun, `MD`→modal, `SUBJ`→conditional, etc.) via a hand-built
lookup table, since the source has no glossary for it. Result: 292 `GrammarPoint` rows (151 carry
1+ real example sentences from the source; 102 are correctly example-less construct names),
upserted by `(title, cefrLevel)` — source rows sharing both naturally collapse into one
`GrammarPoint` with multiple examples (one per Sentence Type variant, since CEFR level can
genuinely differ per variant of the same construct, e.g. passive-present affirmative at A1 vs.
its negative form at B2).

Files: `prisma/etl/grammar_etl.py` (offline ETL, source CSV fetched directly from GitHub raw,
not committed — same as vocab's source CSVs), `prisma/seed-data/grammar_seed.jsonl` (committed,
292 rows), `prisma/seedGrammar.ts` (idempotent Prisma loader, `npm run seed:grammar`). Verified
against real Docker Postgres: 292 points / 151 examples on first run, identical counts with no
duplicates on re-run, lint/build/test green (33/33).

## Phase B — Reading passages + listening audio (✅ done, pilot batch)

`Passage`/`MediaAsset` added to `services/learning-materials-service/prisma/schema.prisma`
(migration `20260623035908_add_passage_media_primitives`). Deviates slightly from the original
sketch: `Passage` has a `mediaAssetId` FK to `MediaAsset` instead of a duplicated plain-string
`audioKey` — the object key lives in exactly one place (`MediaAsset.objectKey`), reached via the
relation. `MediaAsset.duration` became `durationMs` (`Int?`, currently always `null` — VOA's
pages don't expose a duration anywhere scrapeable; would need to be derived from the audio file
itself, not done in this pass) and `alignment` is `Json?` (always `null` for now — no forced
alignment was run, just transcript + audio, no word-level timestamps).

Source: VOA Learning English's **"Words and Their Stories"** series
(`learningenglish.voanews.com/z/987`) — short idiom-explainer segments, each a plain-text
transcript paired with an mp3 narration, already public domain (VOA is a U.S.
government-funded broadcaster; 17 U.S.C. §105). Pulled a 12-article pilot batch (chosen over a
larger batch to prove the pipeline first): fetched each article page (needs a browser-like
User-Agent header, the site 403s a bare/default one), extracted title + transcript paragraphs
(stops before the "Words in This Story" glossary heading, since VOA's spoken narration doesn't
read that section — keeps `Passage.body` aligned with what `MediaAsset` actually narrates) + the
mp3 URL via regex (no official API), downloaded the audio, and uploaded it to a new
`passage-audio` MinIO bucket (added to `infra/docker-compose.yml`'s `minio-init-agents` job
alongside `pronunciation-audio`/`exercise-audio`/`writing-samples`). `cefrLevel` is a heuristic,
no LLM: cross-reference each transcript's words against the already-seeded vocab spine
(`vocab_seed.jsonl`'s `lemma`→`cefr_level`) and take the 85th-percentile level among matches,
falling back to B1 if too few words match — landed at A2 for 11 of 12, B1 for one, consistent
with this series' deliberately simplified vocabulary.

Files: `agents/tools/voa_passages_etl.py` (new `agents/tools/` directory — this script isn't an
AGT agent and never will be, so it doesn't belong under one of the numbered `agt*` packages;
doesn't need an `AgentID`/LLM call since VOA audio is pre-recorded, not LLM-narrated; needs
`boto3` + a reachable MinIO, run manually, not in CI), `prisma/seed-data/passage_seed.jsonl`
(committed, 12 rows), `prisma/seedPassages.ts` (idempotent Prisma loader, upserts `Passage` by
`(title, source)` and `MediaAsset` by `objectKey`, `npm run seed:passages`). Verified against
real Docker Postgres + MinIO: 12 passages / 12 media assets on first run, identical counts with
no duplicates on re-run, lint/build/test green (33/33), and — the Phase-B-specific check this
roadmap calls for — a presigned MinIO URL for a stored `objectKey` was fetched for real and
confirmed to be a valid playable mp3 (`file` reported "MPEG ADTS, layer III... 44.1 kHz").

Project Gutenberg / Simple Wikipedia are grounding-only inputs for Phase C's LLM, never shipped
as our own primitives (same CC BY-SA boundary as Octanove/Wiktionary) — unaffected by this pass,
since VOA alone covered the pilot batch.

## Phase C — Exercise generation, the real Layer 2 (next up)

Replaces the 27 hand-written `seed.ts` exercises with a generated curriculum grounded on the
vocab + grammar + passage primitives from Phases 0/A/B.

- New `AgentID` enum value in `agents/shared/llm/router.py` (e.g. `AGT12` or a non-numbered
  `CONTENT_GEN`), registered in `OPENROUTER_MODELS` — async/offline tier, alongside
  AGT02/07/08/09/11.
- Generation script (Python, under `agents/`): reads primitives via Learning Materials' existing
  internal `GET` routes (`/internal/catalog/summary` + new additive read endpoints for
  vocab/grammar as needed), constructs prompts grounded in specific `VocabEntry`/`GrammarPoint`/
  `Passage` rows for a target CEFR level and skill, calls `call_llm`, writes draft
  `Module`/`Lesson`/`Exercise` records to JSONL — same shape the Prisma models already expect
  (`type`, `prompt`, `answerKey`, `difficulty`, `skill`), no schema changes needed.
- Human review via git diff (CEFR-accuracy, answer-key correctness) before merge.
- Loader: a script parallel to `prisma/seed.ts` that upserts the reviewed JSONL's
  `Module`/`Lesson`/`Exercise` rows.
- Deliberately out of scope: a formal join table tracking which `VocabEntry`/`GrammarPoint` an
  exercise drew on — keep that traceability in the generation script's prompt/JSONL metadata;
  only add a real join table if something downstream (e.g. spaced-repetition linking) needs to
  query it.

## Explicitly out of scope (this whole roadmap)

- **Speaking practice content** (scenario/topic bank) — AGT-03/TTS-owned, blocked on TTS not
  existing anywhere yet; no backend primitive needed until that's unblocked.
- **Any TS-side MinIO/S3 client** — stays Python-only across all phases.
- **A content review/moderation UI** — git-based review is sufficient at current volume.
- **`freqRank` enrichment** (NGSL/SUBTLEX) — pending a licensing check, unrelated to phase
  sequencing.

## Verification recipe (same for every phase)

1. `npx prisma migrate dev --name <phase>` runs clean against local Docker Postgres.
2. `npm run seed:<phase>` loads the expected row count (cross-check against the ETL/generation
   script's own summary stats).
3. Re-run the same seed command — confirm no duplicate rows (idempotent upsert).
4. `npm run lint`, `npm run build`, `npm run test` stay green for `learning-materials-service`.
5. Phase B only: confirm the MinIO object actually resolves (presigned URL or direct bucket read)
   before trusting a stored `audioKey`.

# Learning materials content roadmap: vocab, grammar, passages/audio, exercise generation

**Status as of 2026-06-24**: Phase 0 (vocab spine), Phase A (grammar primitives), Phase B
(reading passages + listening audio — pilot batch), and Phase C (LLM-generated exercises —
pilot batch) all done. This doc is a sub-plan inside the broader server-side implementation —
see `CLAUDE.local.md` Current Status for where this fits relative to the rest of the roadmap
(offline sync, etc.). Nothing here changes the architecture split documented there.

**⚠️ Known issue affecting every phase below, found 2026-06-24**: `.gitignore`'s blanket
`**/seed-data` rule means none of the `*_seed.jsonl` files this doc describes as "committed"
have actually ever been committed to git (`git ls-files` confirms all four are untracked).
Every phase's "Files" section below is describing the *intended* design, not the current repo
state — until the gitignore rule is fixed and these files are actually committed, this content
only exists on whichever machine generated it, and `npm run seed:*` will fail for anyone who
hasn't run the corresponding ETL/generation script themselves first.

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

## Phase B — Reading passages + listening audio (✅ done, expanded 2026-06-24)

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

**Expanded to 26 passages (2026-06-24)**, after the pilot batch proved the pipeline: same
`ARTICLES`-list pattern in `agents/tools/voa_passages_etl.py`, just 14 more hand-verified
entries appended. Sourcing got materially harder for this second batch — neither the live
`/z/987` index page nor `/z/987/episodes`' pagination actually expose more than the same
rotating ~12 recent items (the apparent "page 2, 3, ..." numeric-id links turned out to point at
a separate syndication copy of each episode with no `class="wsw"` transcript section at all,
confirmed by diffing page size and checking for the marker directly — not a scraping bug, that
specific id genuinely has no server-rendered transcript). The reliable path was searching for
each individual episode's real slug+id permalink (which does carry the full `wsw` transcript +
mp3 — same template the original 12 use) and verifying `class="wsw"` + a `.mp3` link are both
present before adding it to `ARTICLES`, one article at a time. Landed at 26 total (24 A2, 2 B1)
— still skewed to A2 like the original batch, since VOA's own series is leveled
"intermediate/upper-beginner" regardless of topic, so the CEFR heuristic has little room to
land elsewhere. `prisma/seed-data/passage_seed.jsonl` is now 26 rows / ~204KB (up from 12 /
~75KB); rerunning `npm run seed:passages` confirmed idempotent (26 in, 26 in, no duplicates).

Files: `agents/tools/voa_passages_etl.py` (new `agents/tools/` directory — this script isn't an
AGT agent and never will be, so it doesn't belong under one of the numbered `agt*` packages;
doesn't need an `AgentID`/LLM call since VOA audio is pre-recorded, not LLM-narrated; needs
`boto3` + a reachable MinIO, run manually, not in CI), `prisma/seed-data/passage_seed.jsonl`
(committed, 26 rows), `prisma/seedPassages.ts` (idempotent Prisma loader, upserts `Passage` by
`(title, source)` and `MediaAsset` by `objectKey`, `npm run seed:passages`). Verified against
real Docker Postgres + MinIO: 12 passages / 12 media assets on first run, identical counts with
no duplicates on re-run, lint/build/test green (33/33), and — the Phase-B-specific check this
roadmap calls for — a presigned MinIO URL for a stored `objectKey` was fetched for real and
confirmed to be a valid playable mp3 (`file` reported "MPEG ADTS, layer III... 44.1 kHz").

Project Gutenberg / Simple Wikipedia are grounding-only inputs for Phase C's LLM, never shipped
as our own primitives (same CC BY-SA boundary as Octanove/Wiktionary) — unaffected by this pass,
since VOA alone covered the pilot batch.

## Phase C — Exercise generation, the real Layer 2 (✅ done, pilot batch)

Replaces (additively) the 27 hand-written `seed.ts` exercises with a generated curriculum
grounded on the vocab + grammar + passage primitives from Phases 0/A/B.

**Generation unit is the atomic exercise, not the module.** The first working version of the
generation script asked the model to invent a whole module/lesson/exercise hierarchy in a single
call per module, embedding ~25 vocabulary words and ~15 grammar points and telling the model to
"naturally weave [them] in." In practice this produced incoherent sentences — e.g. one lesson
forced "wardrobe," "social networking," and "artist" into the same sentences, and one
sentence-correction "fix" actually introduced a new grammatical error rather than removing one.
The fix was architectural, not prompt-tuning: scope every LLM call to exactly **one** grounding
primitive (one `Passage`, or one `GrammarPoint`), and make module/lesson grouping **deterministic
code**, not model output — same philosophy as `agt02_learning_path/optimizer
.select_daily_activities` being deterministic rather than LLM-driven sequencing. Concretely:
- **Reading**: one LLM call per passage, asking for N mcq exercises based only on that passage's
  text. One lesson per passage (the passage is the natural lesson unit) — no grouping logic
  needed at all.
- **Writing**: one LLM call per single `GrammarPoint`, asking for N exercises (`fill-blank`/
  `sentence-correction`) drilling that one construct and nothing else. The resulting flat pool of
  exercises is then chunked into fixed-size lessons in fetch order by plain code — lesson titles
  are derived from the grammar-point titles each chunk contains.

Every generated exercise carries a `grounded_on` field (e.g.
`{"type": "passage", "id": ..., "title": ...}` or `{"type": "grammar_point", ...}`) purely for
human-review traceability. Deliberately no formal join table tracking which `VocabEntry`/
`GrammarPoint`/`Passage` an exercise drew on — that traceability lives in this JSONL metadata
instead; only add a real join table if something downstream (e.g. spaced-repetition linking)
needs to query it.

**Model**: `AgentID.CONTENT_GEN` in `agents/shared/llm/router.py` — explicitly *not* a 12th
numbered agent (`AGT01`-`AGT11` are unaffected), just a router dispatch key, same non-service
status as `agents/tools/voa_passages_etl.py`. Went through three choices before landing: first
`anthropic/claude-3.5-sonnet` via OpenRouter (paid, team's initial choice for quality), then
swapped to `deepseek/deepseek-chat-v3.1:free` to match `AGT02`/`AGT07`/`AGT09`'s convention —
but that slug turned out to be **retired by OpenRouter** (404, redirects to the paid
`deepseek/deepseek-chat-v3.1`; this likely affects those three agents too, not yet fixed for
them). Landed on `openai/gpt-oss-20b:free` — confirmed free, not upstream-rate-limited, and
reliable at strict-JSON output, but it's a reasoning model that spends tokens on an internal
`reasoning` field before emitting `content`, so calls use `max_tokens=8000` (a smaller budget
silently returned empty responses for more complex prompts).

Files: `agents/tools/content_gen_etl.py` (the generation script — Python, calls `call_llm` via
the router, reads grounding primitives from the three internal routes below, writes
`generated_content_seed.jsonl`), `prisma/seedGeneratedContent.ts` (`npm run seed:generated`,
idempotent Prisma loader, upserts `Module`/`Lesson`/`Exercise` by the script's own deterministic
slug ids). Verified against real Docker Postgres: loaded and confirmed live via
`/internal/catalog/summary` — `mod-gen-reading-a2` (2 lessons / 10 exercises) and
`mod-gen-writing-b1` (4 lessons / 16 exercises). Human review (git diff on the generated JSONL)
caught and fixed two real defects from the first module-level generation attempt before they
ever reached the loader: a `fill-blank` exercise whose sentence had no actual blank in it, and
the ungrammatical sentence-correction "fix" mentioned above; one stale lesson left over from
that earlier attempt (`mod-gen-reading-a2-l3`) was manually deleted from Postgres after the
rewrite, since the loader only upserts and never deletes.

**`listening-comprehension` prompt shape now includes `audioKey`** (2026-06-24): every
`listening-comprehension` exercise prompt is `{transcript, question, options, audioKey}` — added
so a client can render/play the matching audio from one exercise response, no second fetch
required. The 9 hand-written `listening-comprehension` exercises in `prisma/seed.ts` (and the
matching live rows in this session's Docker Postgres) carry `audioKey: null`, because none of
them were ever backed by a real `Passage`/`MediaAsset` — they're synthetic placeholder
transcripts invented for `seed.ts`, not derived from VOA content. `null` is the honest value
here, not a bug. The `AssessmentQuestion` table has its own separate set of listening prompts
(`aq-l-*` in `seed.ts`) with the same gap (no `audioKey` field at all) — left untouched, since
the question that prompted this was specifically about curriculum exercises, not the assessment
bank; same fix would apply there if it's ever revisited.

**✅ Listening generator built (2026-06-24)** — `content_gen_etl.py` gained
`_generate_listening_exercises`/`_build_listening_module`, a near-clone of the reading-mcq
generator: same atomic per-passage LLM call, `type: "listening-comprehension"` instead of
`"mcq"`, `transcript` instead of `passage` in the prompt. The one real difference: `audioKey` is
never trusted to the LLM — it's set programmatically from the passage's real
`MediaAsset.objectKey` (already resolved via `/internal/passages`) after generation, so it can't
be hallucinated or mismatched. `_fetch_passages` gained an `offset` param (over-fetch + Python
slice, since `/internal/passages` has no `skip` param) so the reading and listening batches draw
from *different* passages out of the pool — `READING_BATCHES` takes indices 0-2, `LISTENING_BATCHES`
takes indices 3-5 — rather than reusing the exact same 3 passages for both skills. Loaded and
verified live via `/internal/catalog/summary`: `mod-gen-listening-a2` (3 lessons / 15 exercises),
each exercise's `audioKey` spot-checked to match its lesson's actual passage with no cross-lesson
mixing. Catalog total is now 6 modules / 19 lessons / 73 exercises across all three generated
skills (reading, writing, listening) plus the 3 original hand-written modules.

**Already prepped (2026-06-23), used by the above**: three internal `GET` routes on
`learning-materials-service` for the generation script to pull grounding primitives:
`/internal/vocab` (with senses + pronunciations, filterable by `cefrLevel`/`domainTag`),
`/internal/grammar` (with examples, filterable by `cefrLevel`/`category`), `/internal/passages`
(with `audioKey` resolved from the linked `MediaAsset`, filterable by `cefrLevel`/`topicTag`) —
all paginated via a shared `limit` param (default 50, capped at 200). `src/lib/mappers.ts`
gained matching internal-only DTOs (plain inline shapes, not added to
`@ai-agentic-english/shared` since no TS client consumes them). 5 new tests, 38/38 passing.

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

**Fresh machine / fresh `docker compose up`?** Postgres rows and MinIO are populated separately —
see `infra/README.md`'s "MinIO-backed audio content" section for the per-machine audio re-fetch
step required before `audioKey`s on a new machine point at anything real.

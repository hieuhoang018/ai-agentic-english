# Listening Question Taxonomy — Phase 4

**Status**: Design complete (2026-06-30). This document is the contract Phase 5's script
generator must satisfy. Every entry in the taxonomy maps a `(cognitive type × response format)`
pair to its answer-position constraint and CEFR applicability. The Phase 5 listening-script
prompt must enforce the position constraint for whichever entry is assigned to a given lesson.

---

## Background

The current generation pipeline (`agents/tools/content_gen_etl.py`) feeds a raw VOA passage as
the "transcript" and asks the LLM to generate excerpt-based questions. VOA passages are
structured journalistically (key fact first, elaboration after), so every question becomes a
single-sentence detail lookup answerable before the audio finishes — the symptom this taxonomy
is designed to eliminate.

The fix has two axes:

1. **Cognitive type** — what mental operation the question requires.
2. **Response format** — how the learner answers (adopted from IELTS Listening formats; no
   IELTS source content is used as grounding material).

These axes are independent: any cognitive type can be paired with any compatible format,
producing a diverse question space without repetition.

---

## Axis 1 — Cognitive Type

| ID | Name | What it requires | Answer-position constraint |
|---|---|---|---|
| `gist` | Gist / main idea | Synthesise the whole recording into one overarching idea | `WHOLE` — no single segment states the answer; synthesis is required |
| `sequencing` | Sequencing | Track the order in which events or points appear across the recording | `SEQUENTIAL` — script presents events in a trackable order; question asks to reconstruct it |
| `inference` | Inference | Deduce something not stated directly, by combining ≥ 2 non-adjacent segments | `MULTI_PART` — neither segment alone answers the question |
| `detail-at-end` | Detail-at-end | Recall a specific fact that appears only in the back third of the recording | `BACK_30` — answer-bearing sentence is in the final 30% by word count; the first 70% must not give it away |

### Position-constraint definitions

- **WHOLE**: The question cannot be answered from any excerpt alone; the learner must attend to
  the whole recording.
- **SEQUENTIAL**: The script presents three or more events or points in a defined order; the
  question asks about that order. Answers are distributed across the recording.
- **MULTI_PART**: The answer requires combining clues from two or more non-adjacent segments.
  Segment A and segment B each provide partial information; neither is sufficient alone.
- **BACK_30**: The sentence that directly states the answer appears after the 70% word-count
  mark. Script generation must not foreshadow the answer in the earlier 70%.

---

## Axis 2 — Response Format

| Format | Description | Implementation primitive | Complexity |
|---|---|---|---|
| `mcq-single` | 4 options, select one correct answer | Existing `mcq` / `listening-comprehension` type | Low |
| `mcq-multi` | 4–5 options, select exactly **two** correct answers | New — extend existing MCQ type with `answer_count: 2` | Medium |
| `sentence-completion` | Gapped sentence; learner writes or selects the completing word/phrase | Closest to existing `fill-blank` primitive | Low |
| `note-completion` | Structured note (form, table, or bullet list) with 2–4 blank slots distributed across the note; learner fills during listening | Composite of `fill-blank` applied to a multi-slot template | Medium |
| `matching` | Two lists; learner matches each item in list A to an item in list B (events → order, speakers → opinion, topics → detail) | New type — requires generating ≥ 3 valid pairs plus 1 distractor item per list | Medium |

**Deferred formats** (not generated in current phase):

- *Plan / map / diagram labelling* — requires generating and maintaining a synced visual asset;
  no visual-asset pipeline exists yet. Re-evaluate when a diagram-rendering layer is added.
- *Flow-chart completion* — workable but needs careful sequential-process script structuring;
  revisit once the prioritized formats are validated.

---

## Taxonomy Table — Valid (Cognitive Type × Response Format) Pairs

Each row is a valid entry. The **ID** is used as the `question_type` label in the generated
exercise prompt. Phase 5's script generator selects one or more entries per lesson and must
enforce the listed position constraint when writing the script.

| ID | Cognitive type | Response format | Position constraint | CEFR applicability | Notes |
|---|---|---|---|---|---|
| `G-MCQ1` | gist | mcq-single | WHOLE | A1+ | Simplest gist question; lowest-complexity generation. Default for A1 lessons. |
| `G-MCQ2` | gist | mcq-multi (choose 2) | WHOLE | A2+ | Forces more careful full-recording attention than single-answer MCQ. |
| `G-SC` | gist | sentence-completion | WHOLE | A2+ | "The recording mainly explains ______." Straightforward to generate. |
| `G-NC` | gist | note-completion | WHOLE | B1+ | Summary note covering the whole recording; slots must span from start to end. |
| `S-M` | sequencing | matching | SEQUENTIAL | A2+ | "Match each event to the order it is mentioned." Ideal sequencing format. |
| `S-SC` | sequencing | sentence-completion | SEQUENTIAL | A2+ | "After discussing X, the speaker then ______." Lighter than matching. |
| `S-NC` | sequencing | note-completion | SEQUENTIAL | B1+ | Ordered bullet list with gaps; learner reconstructs the sequence. |
| `I-MCQ1` | inference | mcq-single | MULTI_PART | B1+ | "What can be concluded about X?" Distractors must be plausible, not obviously wrong. |
| `I-MCQ2` | inference | mcq-multi (choose 2) | MULTI_PART | B2+ | Two correct inferences; highest cognitive demand of all MCQ variants. |
| `I-SC` | inference | sentence-completion | MULTI_PART | B1+ | "The speaker's attitude implies that ______." Lower lift than matching. |
| `I-M` | inference | matching | MULTI_PART | B2+ | "Match each speaker/section to their implied attitude or conclusion." Highest generation complexity. |
| `D-MCQ1` | detail-at-end | mcq-single | BACK_30 | A2+ | Classic detail question, position-constrained. Easiest detail format to generate. |
| `D-SC` | detail-at-end | sentence-completion | BACK_30 | A2+ | Gap targets the back-30% fact. Question stem must not paraphrase the first 70%. |
| `D-NC` | detail-at-end | note-completion | BACK_30 | A2+ | Form/table where the final slot(s) hold the back-30% detail. Naturally enforces position because earlier slots are filled first. Best format for detail-at-end. |

---

## CEFR Band Rules

The script generator selects question types from the allowed set for the lesson's CEFR level.
Inference is excluded below B1 because multi-part deduction is too demanding at elementary
levels. Multi-answer MCQ is excluded below A2 because it requires managing a larger option set.

| CEFR | Allowed cognitive types | Allowed response formats | Recommended entry IDs |
|---|---|---|---|
| A1 | gist | mcq-single | `G-MCQ1` |
| A2 | gist, sequencing, detail-at-end | mcq-single, mcq-multi, sentence-completion, matching | `G-MCQ1`, `G-MCQ2`, `G-SC`, `S-M`, `S-SC`, `D-MCQ1`, `D-SC`, `D-NC` |
| B1 | gist, sequencing, inference, detail-at-end | all prioritised formats | all except `I-MCQ2`, `I-M` |
| B2 | all | all prioritised formats | all 14 entries |
| C1+ | all | all prioritised formats | all 14 entries; weight toward `I-MCQ2`, `I-M`, `G-NC` |

---

## Generation Constraints for Phase 5

When Phase 5's script generator is given a `(cognitive type × response format)` entry, it must
produce a script that satisfies the following invariants. These are checked post-generation
before the exercise record is written.

| Position constraint | Invariant | Enforcement point |
|---|---|---|
| WHOLE | No sentence in isolation answers the question. | Prompt instruction + human review of seed JSONL. |
| SEQUENTIAL | ≥ 3 events or points appear in explicit, trackable order. Script does not jump between them non-linearly. | Prompt instruction; validated by re-reading generated script. |
| MULTI_PART | At least 2 non-adjacent sentences each contribute a required partial answer. The gap between them is ≥ 20% of script word count. | Prompt instruction. |
| BACK_30 | `ceil(0.7 × total_word_count)` — the answer-bearing sentence must start after this index. First 70% must contain no direct statement or strong paraphrase of the answer. | Word-count check in ETL before the exercise record is emitted. |

The BACK_30 constraint is the only one amenable to automated enforcement today (word-count
split). The others rely on prompt design and seed-JSONL review. A future Phase 6 addition will
verify estimated audio duration against the word-count split to ensure the BACK_30 boundary
aligns with actual listening time, not just word count.

---

## Implementation Priority

For the first regeneration pass, prioritise these six entries (low-to-medium complexity, cover
all four cognitive types):

1. `G-MCQ1` — baseline, replaces all existing A1 listening questions
2. `D-NC` — best format for detail-at-end; immediately fixes the "answerable before finish" symptom
3. `S-M` — sequencing via matching; best sequencing format
4. `I-MCQ1` — unlocks inference at B1+
5. `G-SC` — lightweight gist alternative to MCQ for variety
6. `D-SC` — lightweight detail-at-end alternative to note completion

Defer `mcq-multi`, `I-M`, and `I-MCQ2` until the six above are validated in the seed JSONL.

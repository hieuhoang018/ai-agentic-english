import {
  AssessmentQuestionDto,
  CefrLevel,
  Difficulty,
  ExerciseDto,
  ExerciseInternalDto,
  ExerciseType,
  LearningPathDto,
  LessonDto,
  ModuleDto,
  PathDefinition,
  ReviewFlashcardDto,
  ReviewFlashcardTopicDto,
  ReviewGrammarLessonDto,
  ReviewGrammarLessonSummaryDto,
  ReviewGrammarSectionDto,
  Skill,
} from '@ai-agentic-english/shared';

import type {
  AssessmentQuestion,
  Exercise,
  GrammarExample,
  GrammarPoint,
  LearningPath,
  Lesson,
  MediaAsset,
  Module,
  Passage,
  VocabEntry,
  VocabPron,
  VocabSense,
} from '../../prisma/generated/client';

export const REVIEW_CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const flashcardTopicDescriptions: Record<CefrLevel, string> = {
  A1: 'Starter vocabulary from the seeded learning-materials catalog.',
  A2: 'Everyday vocabulary for building confidence in common situations.',
  B1: 'Intermediate vocabulary for work, study, and independent reading.',
  B2: 'Upper-intermediate vocabulary for more precise communication.',
  C1: 'Advanced vocabulary for nuanced professional and academic English.',
  C2: 'Expert vocabulary for fluent, highly precise expression.',
};

type ReviewVocabEntryRow = VocabEntry & { senses: VocabSense[]; pronunciations: VocabPron[] };
type ReviewGrammarSummaryRow = GrammarPoint & { _count: { examples: number } };
type ReviewGrammarDetailRow = GrammarPoint & { examples: GrammarExample[] };

export function isReviewCefrLevel(value: string): value is CefrLevel {
  return REVIEW_CEFR_LEVELS.includes(value as CefrLevel);
}

function compareCefrLevel(a: string, b: string): number {
  return REVIEW_CEFR_LEVELS.indexOf(a as CefrLevel) - REVIEW_CEFR_LEVELS.indexOf(b as CefrLevel);
}

function toTitleCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function toReviewCategoryId(category: string): string {
  return (
    category
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'grammar'
  );
}

export function toModuleDto(m: Module): ModuleDto {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    cefrLevel: m.cefrLevel as CefrLevel,
    skillFocus: m.skillFocus as Skill,
    order: m.order,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export function toLessonDto(l: Lesson): LessonDto {
  return {
    id: l.id,
    moduleId: l.moduleId,
    title: l.title,
    content: l.content,
    order: l.order,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

export function toExerciseDto(e: Exercise): ExerciseDto {
  return {
    id: e.id,
    lessonId: e.lessonId,
    type: e.type as ExerciseType,
    prompt: e.prompt,
    difficulty: e.difficulty as Difficulty,
    skill: e.skill as Skill,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export function toExerciseInternalDto(e: Exercise): ExerciseInternalDto {
  return {
    ...toExerciseDto(e),
    answerKey: e.answerKey,
  };
}

export function toLearningPathDto(p: LearningPath): LearningPathDto {
  return {
    id: p.id,
    userId: p.userId,
    version: p.version,
    status: p.status as 'active' | 'superseded',
    generatedAt: p.generatedAt.toISOString(),
    pathDefinition: p.pathDefinition as unknown as PathDefinition,
  };
}

export function toAssessmentQuestionDto(q: AssessmentQuestion): AssessmentQuestionDto {
  return {
    id: q.id,
    skill: q.skill as Skill,
    cefrLevelTarget: q.cefrLevelTarget as CefrLevel,
    prompt: q.prompt,
    order: q.order,
  };
}

export function toReviewFlashcardTopicDto(row: {
  cefrLevel: string;
  _count: { _all: number };
}): ReviewFlashcardTopicDto {
  const cefrLevel = row.cefrLevel as CefrLevel;
  return {
    id: cefrLevel,
    cefrLevel,
    title: `${cefrLevel} Vocabulary`,
    description: flashcardTopicDescriptions[cefrLevel],
    totalCards: row._count._all,
  };
}

export function toReviewFlashcardDto(v: ReviewVocabEntryRow): ReviewFlashcardDto {
  const primarySense = [...v.senses].sort((a, b) => a.senseRank - b.senseRank)[0];
  const primaryPronunciation = v.pronunciations.find((p) => p.isPrimary) ?? v.pronunciations[0];

  return {
    id: v.id,
    topicId: v.cefrLevel as CefrLevel,
    term: v.lemma,
    partOfSpeech: v.pos,
    definition: primarySense?.definition ?? null,
    example: primarySense?.example ?? null,
    ipa: primaryPronunciation?.ipa ?? null,
    cefrLevel: v.cefrLevel as CefrLevel,
    domainTag: v.domainTag,
    source: v.source,
    license: v.license,
  };
}

export function toReviewGrammarLessonSummaryDto(g: ReviewGrammarSummaryRow): ReviewGrammarLessonSummaryDto {
  return {
    id: g.id,
    categoryId: toReviewCategoryId(g.category),
    category: g.category,
    title: g.title,
    cefrLevel: g.cefrLevel as CefrLevel,
    explanation: g.explanation,
    exampleCount: g._count.examples,
  };
}

export function toReviewGrammarLessonDto(g: ReviewGrammarDetailRow): ReviewGrammarLessonDto {
  return {
    id: g.id,
    categoryId: toReviewCategoryId(g.category),
    category: g.category,
    title: g.title,
    cefrLevel: g.cefrLevel as CefrLevel,
    explanation: g.explanation,
    exampleCount: g.examples.length,
    examples: g.examples.map((example) => ({
      id: example.id,
      sentence: example.sentence,
      note: example.note,
    })),
    source: g.source,
    license: g.license,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

export function toReviewGrammarSectionsDto(rows: ReviewGrammarSummaryRow[]): ReviewGrammarSectionDto[] {
  const grouped = new Map<string, ReviewGrammarLessonSummaryDto[]>();

  for (const row of rows) {
    const lesson = toReviewGrammarLessonSummaryDto(row);
    grouped.set(row.category, [...(grouped.get(row.category) ?? []), lesson]);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, lessons]) => {
      const sortedLessons = [...lessons].sort((a, b) => {
        const levelComparison = compareCefrLevel(a.cefrLevel, b.cefrLevel);
        if (levelComparison !== 0) return levelComparison;
        return a.title.localeCompare(b.title);
      });
      const cefrLevels = [...new Set(sortedLessons.map((lesson) => lesson.cefrLevel))].sort(compareCefrLevel);

      return {
        id: toReviewCategoryId(category),
        category,
        title: toTitleCase(category),
        lessonCount: sortedLessons.length,
        cefrLevels,
        lessons: sortedLessons,
      };
    });
}

// Internal-only DTOs below: consumed by the Phase C generation script (Python, under
// agents/), not by any TS client, so they're plain inline shapes rather than types shared
// via @ai-agentic-english/shared.

export function toVocabEntryInternalDto(
  v: VocabEntry & { senses: VocabSense[]; pronunciations: VocabPron[] },
) {
  return {
    id: v.id,
    lemma: v.lemma,
    pos: v.pos,
    cefrLevel: v.cefrLevel,
    domainTag: v.domainTag,
    senses: v.senses
      .sort((a, b) => a.senseRank - b.senseRank)
      .map((s) => ({ definition: s.definition, example: s.example, synonyms: s.synonyms })),
    pronunciations: v.pronunciations.map((p) => ({
      ipa: p.ipa,
      variant: p.variant,
      isPrimary: p.isPrimary,
    })),
  };
}

export function toGrammarPointInternalDto(g: GrammarPoint & { examples: GrammarExample[] }) {
  return {
    id: g.id,
    title: g.title,
    category: g.category,
    cefrLevel: g.cefrLevel,
    explanation: g.explanation,
    examples: g.examples.map((e) => ({ sentence: e.sentence, note: e.note })),
  };
}

export function toPassageInternalDto(p: Passage & { mediaAsset: MediaAsset | null }) {
  return {
    id: p.id,
    title: p.title,
    body: p.body,
    cefrLevel: p.cefrLevel,
    topicTags: p.topicTags,
    isGenerated: p.isGenerated,
    audioKey: p.mediaAsset?.objectKey ?? null,
  };
}

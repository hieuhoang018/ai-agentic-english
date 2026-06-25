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

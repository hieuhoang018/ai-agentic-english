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
  LearningPath,
  Lesson,
  Module,
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

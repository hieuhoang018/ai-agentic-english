import { ExerciseDto, ExerciseInternalDto, LearnerModelDto, ProgressDto } from '@ai-agentic-english/shared';
import type { LearnerModel, Progress } from '../../prisma/generated/client';

export function toLearnerModelDto(m: LearnerModel): LearnerModelDto {
  return {
    userId: m.userId,
    currentLevel: m.currentLevel as LearnerModelDto['currentLevel'],
    dailyTimeBudgetMinutes: m.dailyTimeBudgetMinutes,
    goals: m.goals as string[],
    weakAreas: m.weakAreas as string[],
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

// Answer keys are never forwarded to the client (README §8.2.2) — strip before responding.
export function toPublicExerciseDto(e: ExerciseInternalDto): ExerciseDto {
  return {
    id: e.id,
    lessonId: e.lessonId,
    type: e.type,
    prompt: e.prompt,
    difficulty: e.difficulty,
    skill: e.skill,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export function toProgressDto(p: Progress): ProgressDto {
  return {
    userId: p.userId,
    pathId: p.pathId,
    currentModuleId: p.currentModuleId,
    currentLessonId: p.currentLessonId,
    currentExerciseId: p.currentExerciseId,
    completedExerciseIds: p.completedExerciseIds as string[],
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

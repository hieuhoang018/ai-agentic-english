import { CefrLevel, ExerciseDto, Skill } from './learning-materials';

export type ReviewItemType = 'exercise' | 'vocab';

export type ErrorCategory = 'vocab' | 'grammar' | 'pronunciation' | 'fluency' | 'coherence';

export interface LearnerModelDto {
  userId: string;
  currentLevel: Partial<Record<Skill, CefrLevel>>;
  dailyTimeBudgetMinutes: number;
  goals: string[];
  weakAreas: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateLearnerModelInput {
  userId: string;
  currentLevel: Partial<Record<Skill, CefrLevel>>;
  dailyTimeBudgetMinutes: number;
  goals: string[];
  weakAreas?: string[];
}

export interface UpdateLearnerModelInput {
  currentLevel?: Partial<Record<Skill, CefrLevel>>;
  dailyTimeBudgetMinutes?: number;
  goals?: string[];
  weakAreas?: string[];
}

export interface ProgressDto {
  userId: string;
  pathId: string;
  currentModuleId: string | null;
  currentLessonId: string | null;
  currentExerciseId: string | null;
  completedExerciseIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InitializeProgressInput {
  pathId: string;
  currentModuleId?: string;
  currentLessonId?: string;
  currentExerciseId?: string;
}

export interface NextExerciseDto {
  exercise: ExerciseDto;
  source: 'review' | 'path';
  reviewScheduleId?: string;
}

export interface HighlightMistakeDto {
  errorCategory: ErrorCategory;
  errorLabel: string;
  occurrences: number;
  lastOccurredAt: string;
  explanation: string;
  example: string;
}

export interface HighlightVocabDto {
  vocabItemId: string;
  term: string;
  meaning: string;
  due: string;
  explanation: string;
  example: string;
}

export interface ReviewHighlightsDto {
  mistakes: HighlightMistakeDto[];
  vocab: HighlightVocabDto[];
}

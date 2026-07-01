import type { CefrLevel as SharedCefrLevel, PathDefinition } from '@ai-agentic-english/shared';

export type {
  AssessmentQuestionDto,
  AssessmentResultDto,
  CefrLevel,
  Difficulty,
  ExerciseDto,
  ExerciseType,
  LearningPathDto,
  LearningPathStatus,
  LessonDto,
  ModuleDto,
  PathDefinition,
  Skill,
  UpdateUserSettingsDto,
  UserDto,
  UserSettingsDto,
} from '@ai-agentic-english/shared';

export type OnboardingRequest = {
  userId: string;
  currentLevel: SharedCefrLevel;
  dailyTimeBudgetMinutes: number;
  goals: string[];
};

export type OnboardingActivity = NonNullable<PathDefinition['activities']>[number];

export type OnboardingResponse = {
  id: string;
  learningPathId?: string;
  userId: string;
  pathDefinition: PathDefinition;
  createdAt: string;
};

export type GradingRequest = {
  exerciseId: string;
  attemptedAnswer: string;
  userId: string;
};

export type GradingResponse = {
  exerciseId: string;
  correct: boolean;
  score: number;
  feedback: string;
};

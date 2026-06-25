import type { CefrLevel as SharedCefrLevel } from '@ai-agentic-english/shared';

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

export type OnboardingActivity = {
  activity_id: string;
  skill_domain: string;
  activity_type: string;
  title: string;
  estimated_minutes: number;
  difficulty: string;
  completed: boolean;
};

export type OnboardingResponse = {
  id: string;
  userId: string;
  pathDefinition: {
    activities: OnboardingActivity[];
  };
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

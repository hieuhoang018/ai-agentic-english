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
  ReviewFlashcardDto,
  ReviewFlashcardTopicDto,
  ReviewGrammarLessonDto,
  ReviewGrammarLessonSummaryDto,
  ReviewGrammarSectionDto,
  Skill,
  UpdateUserSettingsDto,
  UserDto,
  UserSettingsDto,
} from '@ai-agentic-english/shared';

export type SkillEstimateKey = 'R' | 'L' | 'W';
export type SkillEstimates = Partial<Record<SkillEstimateKey, number>>;

export type OnboardingRequest = {
  userId: string;
  currentLevel: SharedCefrLevel;
  dailyTimeBudgetMinutes: number;
  goals: string[];
  skillEstimates?: SkillEstimates;
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

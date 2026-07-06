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

export type TodaysPlan = {
  clerk_user_id: string;
  plan_id: string | null;
  activities: OnboardingActivity[];
  daily_minutes: number;
};

export type ExerciseLibraryResponse = {
  todaysPlan: TodaysPlan[];
  dueForReview: unknown[];
  recommended: unknown[];
  browse: unknown[];
};

export type StreakResponse = {
  clerk_user_id: string;
  streak: number;
};

export type SpeakingSessionTicketResponse = {
  ticket: string;
  session_id: string;
  expires_in_seconds: number;
};

export type RecommendationItem = {
  id: string;
  title: string;
  skillDomain?: string;
  cefrLevel?: string;
  rationale?: string;
  difficulty?: string;
  cold_start?: boolean;
};

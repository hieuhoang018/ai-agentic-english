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

export type IrtTheta = {
  L: number;
  S: number | null;
  R: number;
  W: number;
};

export type ProfileSummaryResponse = {
  clerk_user_id: string;
  irt_theta: IrtTheta;
  cold_start_flag: boolean;
  goal_profile: { currentLevel?: string; goals?: string[] };
};

export type SessionSummaryItem = {
  start_time: string;
  end_time: string | null;
};

export type AnalysisPlateauResult = {
  plateau: boolean;
  insufficient_data: boolean;
  // Absent (not just empty) when insufficient_data is true — see
  // agents/agt08_analysis/changepoint.py's early-return branch.
  changepoints?: number[];
};

// Mirrors agents/agt08_analysis/cusum.py::detect_persistent_errors's
// per-result dict — no "type" field, despite the Kafka event this data also
// feeds into being named "persistent_weakness".
export type AnalysisPattern = {
  error_type: string;
  skill_domain: string;
  count: number;
  cusum_statistic: number;
};

export type AnalysisLatestResponse = {
  clerk_user_id: string;
  patterns: AnalysisPattern[];
  plateau_by_skill: Record<string, AnalysisPlateauResult>;
  risk_score: number | null;
  insufficient_data: boolean;
};

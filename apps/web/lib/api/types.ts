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

export type DueReviewItem = {
  vocab_id: string;
  word: string;
  context_sentences: string[];
  encounter_count: number;
  sm_stability: number;
  retrievability: number;
  days_since: number;
};

export type RateReviewResponse = {
  item_id: string;
  quality: number;
  new_stability: number;
  next_review: string;
};

export type ReviewCenterErrorEvent = {
  event_id: string;
  error_type: string;
  skill_domain: string;
  severity: number;
  context_excerpt: string | null;
  created_at: string;
};

export type ReviewCenterVocabItem = {
  vocab_id: string;
  word: string;
  encounter_count: number;
  sm_retrievability: number;
  last_encounter: string | null;
  context_sentences: string[];
};

export type ReviewCenterSession = {
  session_id: string;
  start_time: string;
  end_time: string | null;
  skill_focus: string;
};

export type ReviewCenterConversation = {
  conv_id: string;
  session_id: string;
  transcript: unknown;
  created_at: string;
};

export type ReviewCenterBundle = {
  errors: ReviewCenterErrorEvent[];
  vocabulary: ReviewCenterVocabItem[];
  sessions: ReviewCenterSession[];
  conversations: ReviewCenterConversation[];
  semantic_search_available: boolean;
};

export type ReplanResponse = {
  plan_id: string;
  version: number;
  rationale: string;
};

export type TranslateResponse = {
  original: string;
  translated: string;
  zone: string;
  zone_label: string;
  theta_r: number;
  cached: boolean;
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

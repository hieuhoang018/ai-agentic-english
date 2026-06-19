import { CatalogSummaryDto, CefrLevel, ExerciseInternalDto, PathDefinition, Skill } from '../dto/learning-materials';
import { ErrorCategory } from '../dto/memory-progress';

export interface GenerateLearningPathInput {
  currentLevel: Partial<Record<Skill, CefrLevel>>;
  dailyTimeBudgetMinutes: number;
  goals: string[];
  catalogSummary: CatalogSummaryDto;
}

export interface GenerateLearningPathOutput {
  pathDefinition: PathDefinition;
}

export interface GradeOpenResponseInput {
  exercise: ExerciseInternalDto;
  submittedAnswer: unknown;
}

export interface InferredErrorLabel {
  category: ErrorCategory;
  label: string;
  detail?: unknown;
}

export interface GradeOpenResponseOutput {
  score: number;
  isCorrect: boolean;
  feedback: string;
  errorLabels: InferredErrorLabel[];
}

export type HighlightContentInput =
  | { kind: 'mistake'; errorCategory: ErrorCategory; errorLabel: string }
  | { kind: 'vocab'; term: string; meaning: string };

export interface HighlightContentOutput {
  explanation: string;
  example: string;
}

export interface ConversationTurn {
  role: 'user' | 'tutor';
  content: string;
}

export interface TutorReplyInput {
  conversationHistory: ConversationTurn[];
  learnerContext: unknown;
  userMessage: string;
}

export interface TutorReplyOutput {
  replyText: string;
}

export interface SessionTranscriptTurn {
  turnIndex: number;
  userTranscript: string;
  tutorReplyText: string;
}

export interface AnalyzeSessionTranscriptInput {
  transcript: SessionTranscriptTurn[];
}

export interface PatternFinding {
  category: ErrorCategory;
  description: string;
}

export interface AnalyzeSessionTranscriptOutput {
  errorSummary: InferredErrorLabel[];
  patternFindings: PatternFinding[];
}

export interface TranscribeAudioInput {
  audio: Uint8Array;
  encoding?: string;
}

export interface TranscribeAudioOutput {
  transcript: string;
}

export interface SynthesizeSpeechInput {
  text: string;
  voice?: string;
}

export interface SynthesizeSpeechOutput {
  audio: Uint8Array;
  encoding: string;
}

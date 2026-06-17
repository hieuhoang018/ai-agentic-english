import { ErrorCategory } from '../dto/memory-progress';
import { BaseEvent } from './base';

export interface AttemptErrorLabel {
  category: ErrorCategory;
  label: string;
  detail?: unknown;
}

export interface AttemptRecordedEvent extends BaseEvent {
  type: 'attempt.recorded';
  userId: string;
  exerciseId: string;
  attemptId: string;
  submittedAnswer: unknown;
  isCorrect: boolean;
  score?: number;
  feedback?: unknown;
  errorLabels: AttemptErrorLabel[];
  gradedBy: 'deterministic' | 'llm';
}

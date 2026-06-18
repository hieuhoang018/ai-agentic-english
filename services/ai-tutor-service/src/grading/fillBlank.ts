import { ExerciseInternalDto } from '@ai-agentic-english/shared';
import { DeterministicGradingResult, compareToAnswerKey } from './normalize';

export function gradeFillBlank(exercise: ExerciseInternalDto, submittedAnswer: unknown): DeterministicGradingResult {
  return compareToAnswerKey(exercise.answerKey, submittedAnswer);
}

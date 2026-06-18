import { ExerciseInternalDto } from '@ai-agentic-english/shared';
import { gradeFillBlank } from './fillBlank';
import { gradeListeningComprehension } from './listeningComprehension';
import { gradeMcq } from './mcq';
import { DeterministicGradingResult } from './normalize';
import { gradeSentenceCorrection } from './sentenceCorrection';

export type { DeterministicGradingResult } from './normalize';

// Every exercise type seeded so far is objective (single canonical answer). Returning null for
// an unrecognized type is how callers fall back to LlmClient.gradeOpenResponse for true
// open-ended exercises once those exist in the catalog.
export function gradeDeterministic(
  exercise: ExerciseInternalDto,
  submittedAnswer: unknown,
): DeterministicGradingResult | null {
  switch (exercise.type) {
    case 'mcq':
      return gradeMcq(exercise, submittedAnswer);
    case 'fill-blank':
      return gradeFillBlank(exercise, submittedAnswer);
    case 'sentence-correction':
      return gradeSentenceCorrection(exercise, submittedAnswer);
    case 'listening-comprehension':
      return gradeListeningComprehension(exercise, submittedAnswer);
    default:
      return null;
  }
}

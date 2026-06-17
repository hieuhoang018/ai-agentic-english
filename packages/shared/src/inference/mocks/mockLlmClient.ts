import { LlmClient } from '../llmClient';
import {
  AnalyzeSessionTranscriptInput,
  AnalyzeSessionTranscriptOutput,
  GenerateLearningPathInput,
  GenerateLearningPathOutput,
  GradeOpenResponseInput,
  GradeOpenResponseOutput,
  HighlightContentInput,
  HighlightContentOutput,
  TutorReplyInput,
  TutorReplyOutput,
} from '../types';

const MAX_PATH_MODULES = 3;

/** Deterministic canned responses — no real model call. Swapped for a live adapter via INFERENCE_MODE=live. */
export class MockLlmClient implements LlmClient {
  async generateLearningPath(input: GenerateLearningPathInput): Promise<GenerateLearningPathOutput> {
    const modules = input.catalogSummary.modules.slice(0, MAX_PATH_MODULES).map((m) => ({
      moduleId: m.id,
      lessons: [] as { lessonId: string; exerciseIds: string[] }[],
    }));
    return { pathDefinition: { modules } };
  }

  async gradeOpenResponse(input: GradeOpenResponseInput): Promise<GradeOpenResponseOutput> {
    const answer = typeof input.submittedAnswer === 'string' ? input.submittedAnswer.trim() : '';
    const isCorrect = answer.length > 0;
    return {
      score: isCorrect ? 0.8 : 0,
      isCorrect,
      feedback: isCorrect ? 'Good attempt — minor refinements possible.' : 'No answer detected.',
      errorLabels: isCorrect ? [] : [{ category: 'grammar', label: 'incomplete-response' }],
    };
  }

  async generateHighlightContent(input: HighlightContentInput): Promise<HighlightContentOutput> {
    if (input.kind === 'mistake') {
      return {
        explanation: `You've been making a ${input.errorCategory} mistake: ${input.errorLabel}. Review the rule and try again.`,
        example: `Pay close attention to ${input.errorLabel} the next time you practice ${input.errorCategory}.`,
      };
    }
    return {
      explanation: `"${input.term}" means: ${input.meaning}.`,
      example: `Try using "${input.term}" in a sentence today.`,
    };
  }

  async tutorReply(input: TutorReplyInput): Promise<TutorReplyOutput> {
    return { replyText: `(mock tutor) I heard you say: "${input.userMessage}". Let's keep practicing!` };
  }

  async analyzeSessionTranscript(input: AnalyzeSessionTranscriptInput): Promise<AnalyzeSessionTranscriptOutput> {
    return {
      errorSummary: [],
      patternFindings:
        input.transcript.length > 0
          ? [{ category: 'fluency', description: `Completed ${input.transcript.length} turn(s) with no flagged issues (mock analysis).` }]
          : [],
    };
  }
}

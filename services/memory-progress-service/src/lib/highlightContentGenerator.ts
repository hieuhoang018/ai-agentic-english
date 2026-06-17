import { ErrorCategory } from '@ai-agentic-english/shared';

export interface HighlightContent {
  explanation: string;
  example: string;
}

export interface HighlightContentGenerator {
  generateMistakeExplanation(input: { errorCategory: ErrorCategory; errorLabel: string }): Promise<HighlightContent>;
  generateVocabExample(input: { term: string; meaning: string }): Promise<HighlightContent>;
}

// Stand-in for AI Tutor's POST /internal/highlights/generate-content, which doesn't exist
// until Phase 4. Selection (which items to highlight) is deterministic and lives in this
// service; only the explanatory text generation is stubbed here.
export function createStubHighlightContentGenerator(): HighlightContentGenerator {
  return {
    async generateMistakeExplanation({ errorCategory, errorLabel }) {
      return {
        explanation: `You've been making a ${errorCategory} mistake: ${errorLabel}. Review the rule and try again.`,
        example: `Pay close attention to ${errorLabel} the next time you practice ${errorCategory}.`,
      };
    },
    async generateVocabExample({ term, meaning }) {
      return {
        explanation: `"${term}" means: ${meaning}.`,
        example: `Try using "${term}" in a sentence today.`,
      };
    },
  };
}

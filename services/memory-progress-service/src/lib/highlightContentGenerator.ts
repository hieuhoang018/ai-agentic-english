import { ErrorCategory, getEnv } from '@ai-agentic-english/shared';

export interface HighlightContent {
  explanation: string;
  example: string;
}

export interface HighlightContentGenerator {
  generateMistakeExplanation(input: {
    userId: string;
    errorCategory: ErrorCategory;
    errorLabel: string;
  }): Promise<HighlightContent>;
  generateVocabExample(input: { userId: string; term: string; meaning: string }): Promise<HighlightContent>;
}

// Stand-in for AI Tutor's POST /internal/highlights/generate-content, used in Phase 3 before
// that endpoint existed. Selection (which items to highlight) is deterministic and lives in
// this service; only the explanatory text generation was stubbed here. Kept around for tests.
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

// Calls AI Tutor's real POST /internal/highlights/generate-content (Redis-cached there).
export function createAiTutorHighlightContentGenerator(): HighlightContentGenerator {
  const baseUrl = getEnv('AI_TUTOR_SERVICE_URL', 'http://localhost:4004');
  const internalSecret = getEnv('INTERNAL_SECRET', 'dev-internal-secret');

  async function generateContent(body: Record<string, unknown>): Promise<HighlightContent> {
    const res = await fetch(`${baseUrl}/internal/highlights/generate-content`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`AI Tutor request failed: ${res.status}`);
    }

    return (await res.json()) as HighlightContent;
  }

  return {
    generateMistakeExplanation({ userId, errorCategory, errorLabel }) {
      return generateContent({ userId, kind: 'mistake', errorCategory, errorLabel });
    },
    generateVocabExample({ userId, term, meaning }) {
      return generateContent({ userId, kind: 'vocab', term, meaning });
    },
  };
}

import { CefrLevel, LearningPathDto, Skill, getEnv } from '@ai-agentic-english/shared';

export interface GeneratePathInput {
  userId: string;
  currentLevel: Partial<Record<Skill, CefrLevel>>;
  dailyTimeBudgetMinutes: number;
  goals: string[];
}

export interface AiTutorClient {
  generatePath(input: GeneratePathInput): Promise<LearningPathDto>;
}

export function createAiTutorClient(): AiTutorClient {
  const baseUrl = getEnv('AI_TUTOR_SERVICE_URL', 'http://localhost:4004');
  const internalSecret = getEnv('INTERNAL_SECRET', 'dev-internal-secret');

  return {
    async generatePath(input: GeneratePathInput): Promise<LearningPathDto> {
      const res = await fetch(`${baseUrl}/internal/onboarding/generate-path`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        throw new Error(`AI Tutor request failed: ${res.status}`);
      }

      return (await res.json()) as LearningPathDto;
    },
  };
}

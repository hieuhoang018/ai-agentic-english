import {
  CatalogSummaryDto,
  ExerciseInternalDto,
  LearningPathDto,
  NotFoundError,
  PathDefinition,
  getEnv,
} from '@ai-agentic-english/shared';

export interface LearningMaterialsClient {
  getExercise(exerciseId: string): Promise<ExerciseInternalDto>;
  getCatalogSummary(): Promise<CatalogSummaryDto>;
  createLearningPath(userId: string, pathDefinition: PathDefinition): Promise<LearningPathDto>;
}

export function createLearningMaterialsClient(): LearningMaterialsClient {
  const baseUrl = getEnv('LEARNING_MATERIALS_SERVICE_URL', 'http://localhost:4002');
  const internalSecret = getEnv('INTERNAL_SECRET', 'dev-internal-secret');
  const headers = { 'x-internal-secret': internalSecret };

  return {
    async getExercise(exerciseId: string): Promise<ExerciseInternalDto> {
      const res = await fetch(`${baseUrl}/internal/exercises/${exerciseId}`, { headers });
      if (res.status === 404) throw new NotFoundError('Exercise not found');
      if (!res.ok) throw new Error(`Learning Materials request failed: ${res.status}`);
      return (await res.json()) as ExerciseInternalDto;
    },

    async getCatalogSummary(): Promise<CatalogSummaryDto> {
      const res = await fetch(`${baseUrl}/internal/catalog/summary`, { headers });
      if (!res.ok) throw new Error(`Learning Materials request failed: ${res.status}`);
      return (await res.json()) as CatalogSummaryDto;
    },

    async createLearningPath(userId: string, pathDefinition: PathDefinition): Promise<LearningPathDto> {
      const res = await fetch(`${baseUrl}/internal/learning-paths`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ userId, pathDefinition }),
      });
      if (!res.ok) throw new Error(`Learning Materials request failed: ${res.status}`);
      return (await res.json()) as LearningPathDto;
    },
  };
}

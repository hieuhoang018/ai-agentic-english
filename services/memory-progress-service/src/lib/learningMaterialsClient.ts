import { ExerciseInternalDto, LearningPathDto, NotFoundError, getEnv } from '@ai-agentic-english/shared';

export interface LearningMaterialsClient {
  getExercise(exerciseId: string): Promise<ExerciseInternalDto>;
  getLearningPath(pathId: string): Promise<LearningPathDto>;
}

export function createLearningMaterialsClient(): LearningMaterialsClient {
  const baseUrl = getEnv('LEARNING_MATERIALS_SERVICE_URL', 'http://localhost:4002');
  const internalSecret = getEnv('INTERNAL_SECRET', 'dev-internal-secret');

  return {
    async getExercise(exerciseId: string): Promise<ExerciseInternalDto> {
      const res = await fetch(`${baseUrl}/internal/exercises/${exerciseId}`, {
        headers: { 'x-internal-secret': internalSecret },
      });

      if (res.status === 404) {
        throw new NotFoundError('Exercise not found');
      }
      if (!res.ok) {
        throw new Error(`Learning Materials request failed: ${res.status}`);
      }

      return (await res.json()) as ExerciseInternalDto;
    },

    async getLearningPath(pathId: string): Promise<LearningPathDto> {
      const res = await fetch(`${baseUrl}/internal/learning-paths/${pathId}`, {
        headers: { 'x-internal-secret': internalSecret },
      });

      if (res.status === 404) {
        throw new NotFoundError('Learning path not found');
      }
      if (!res.ok) {
        throw new Error(`Learning Materials request failed: ${res.status}`);
      }

      return (await res.json()) as LearningPathDto;
    },
  };
}

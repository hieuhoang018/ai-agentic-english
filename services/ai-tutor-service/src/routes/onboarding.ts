import { CefrLevel, LlmClient, Skill, ValidationError, asyncHandler } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { LearningMaterialsClient } from '../lib/learningMaterialsClient';
import { MemoryProgressClient } from '../lib/memoryProgressClient';

interface GeneratePathBody {
  userId: string;
  currentLevel: Partial<Record<Skill, CefrLevel>>;
  dailyTimeBudgetMinutes: number;
  goals: string[];
}

export function createOnboardingRouter(
  llmClient: LlmClient,
  learningMaterials: LearningMaterialsClient,
  memoryProgress: MemoryProgressClient,
): Router {
  const router = Router();

  router.post(
    '/onboarding/generate-path',
    asyncHandler(async (req, res) => {
      const { userId, currentLevel, dailyTimeBudgetMinutes, goals } = req.body as GeneratePathBody;

      if (!userId || typeof userId !== 'string') {
        throw new ValidationError('userId is required');
      }

      const catalogSummary = await learningMaterials.getCatalogSummary();
      const { pathDefinition } = await llmClient.generateLearningPath({
        currentLevel,
        dailyTimeBudgetMinutes,
        goals,
        catalogSummary,
      });

      const path = await learningMaterials.createLearningPath(userId, pathDefinition);

      const firstModule = pathDefinition.modules[0];
      const firstLesson = firstModule?.lessons[0];
      const firstExerciseId = firstLesson?.exerciseIds[0];

      await memoryProgress.initializeProgress(userId, {
        pathId: path.id,
        currentModuleId: firstModule?.moduleId,
        currentLessonId: firstLesson?.lessonId,
        currentExerciseId: firstExerciseId,
      });

      res.status(201).json(path);
    }),
  );

  return router;
}

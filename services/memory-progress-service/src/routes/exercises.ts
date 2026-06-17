import { NotFoundError, asyncHandler, requireAuth } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { LearningMaterialsClient } from '../lib/learningMaterialsClient';
import { AppPrismaClient } from '../lib/prisma';
import { toPublicExerciseDto } from '../lib/mappers';

export function createExercisesRouter(prisma: AppPrismaClient, learningMaterials: LearningMaterialsClient): Router {
  const router = Router();

  router.get(
    '/next',
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = req.auth!.userId;

      const dueReview = await prisma.reviewSchedule.findFirst({
        where: { userId, itemType: 'exercise', due: { lte: new Date() } },
        orderBy: { due: 'asc' },
      });

      if (dueReview) {
        const exercise = await learningMaterials.getExercise(dueReview.itemId);
        res.json({ exercise: toPublicExerciseDto(exercise), source: 'review', reviewScheduleId: dueReview.id });
        return;
      }

      const progress = await prisma.progress.findUnique({ where: { userId } });
      if (!progress?.currentExerciseId) {
        throw new NotFoundError('No exercise available');
      }

      const exercise = await learningMaterials.getExercise(progress.currentExerciseId);
      res.json({ exercise: toPublicExerciseDto(exercise), source: 'path' });
    }),
  );

  return router;
}

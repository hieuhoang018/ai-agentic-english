import { NotFoundError, asyncHandler, requireAuth } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { AppPrismaClient } from '../lib/prisma';
import { toExerciseDto } from '../lib/mappers';

export function createExercisesRouter(prisma: AppPrismaClient): Router {
  const router = Router();

  router.get(
    '/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const exercise = await prisma.exercise.findUnique({ where: { id: req.params.id } });
      if (!exercise) throw new NotFoundError('Exercise not found');
      res.json(toExerciseDto(exercise));
    }),
  );

  return router;
}

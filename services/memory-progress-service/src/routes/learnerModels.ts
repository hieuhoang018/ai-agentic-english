import { NotFoundError, UpdateLearnerModelInput, ValidationError, asyncHandler, requireAuth } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { Prisma } from '../../prisma/generated/client';
import { AppPrismaClient } from '../lib/prisma';
import { toLearnerModelDto } from '../lib/mappers';

export function createLearnerModelsRouter(prisma: AppPrismaClient): Router {
  const router = Router();

  router.get(
    '/:userId',
    requireAuth,
    asyncHandler(async (req, res) => {
      const model = await prisma.learnerModel.findUnique({ where: { userId: req.params.userId } });
      if (!model) throw new NotFoundError('Learner model not found');
      res.json(toLearnerModelDto(model));
    }),
  );

  router.patch(
    '/:userId',
    requireAuth,
    asyncHandler(async (req, res) => {
      const existing = await prisma.learnerModel.findUnique({ where: { userId: req.params.userId } });
      if (!existing) throw new NotFoundError('Learner model not found');

      const { currentLevel, dailyTimeBudgetMinutes, goals, weakAreas } = req.body as UpdateLearnerModelInput;

      if (
        dailyTimeBudgetMinutes !== undefined &&
        (typeof dailyTimeBudgetMinutes !== 'number' || dailyTimeBudgetMinutes <= 0)
      ) {
        throw new ValidationError('dailyTimeBudgetMinutes must be a positive number');
      }

      const updated = await prisma.learnerModel.update({
        where: { userId: req.params.userId },
        data: {
          ...(currentLevel !== undefined && { currentLevel: currentLevel as Prisma.InputJsonValue }),
          ...(dailyTimeBudgetMinutes !== undefined && { dailyTimeBudgetMinutes }),
          ...(goals !== undefined && { goals: goals as Prisma.InputJsonValue }),
          ...(weakAreas !== undefined && { weakAreas: weakAreas as Prisma.InputJsonValue }),
        },
      });

      res.json(toLearnerModelDto(updated));
    }),
  );

  return router;
}

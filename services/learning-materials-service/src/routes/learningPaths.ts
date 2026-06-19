import { NotFoundError, asyncHandler, requireAuth } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { AppPrismaClient } from '../lib/prisma';
import { toLearningPathDto } from '../lib/mappers';

export function createLearningPathsRouter(prisma: AppPrismaClient): Router {
  const router = Router();

  router.get(
    '/:userId/active',
    requireAuth,
    asyncHandler(async (req, res) => {
      const path = await prisma.learningPath.findFirst({
        where: { userId: req.params.userId, status: 'active' },
        orderBy: { version: 'desc' },
      });
      if (!path) throw new NotFoundError('No active learning path found');
      res.json(toLearningPathDto(path));
    }),
  );

  return router;
}

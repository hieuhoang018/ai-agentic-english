import { asyncHandler } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { AppPrismaClient } from '../lib/prisma';
import { toUserSummaryDto } from '../lib/userMapper';

export function createInternalRouter(prisma: AppPrismaClient): Router {
  const router = Router();

  router.get(
    '/users',
    asyncHandler(async (_req, res) => {
      const users = await prisma.user.findMany({ include: { settings: true } });
      const summaries = users.filter((u) => u.settings !== null).map((u) => toUserSummaryDto({ ...u, settings: u.settings! }));
      res.json(summaries);
    }),
  );

  return router;
}

import { NotFoundError, asyncHandler, requireAuth } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { AppPrismaClient } from '../lib/prisma';
import { toLessonDto, toModuleDto } from '../lib/mappers';

export function createModulesRouter(prisma: AppPrismaClient): Router {
  const router = Router();

  router.get(
    '/',
    requireAuth,
    asyncHandler(async (_req, res) => {
      const modules = await prisma.module.findMany({ orderBy: { order: 'asc' } });
      res.json(modules.map(toModuleDto));
    }),
  );

  router.get(
    '/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const module = await prisma.module.findUnique({ where: { id: req.params.id } });
      if (!module) throw new NotFoundError('Module not found');
      res.json(toModuleDto(module));
    }),
  );

  router.get(
    '/:id/lessons',
    requireAuth,
    asyncHandler(async (req, res) => {
      const module = await prisma.module.findUnique({
        where: { id: req.params.id },
        include: { lessons: { orderBy: { order: 'asc' } } },
      });
      if (!module) throw new NotFoundError('Module not found');

      res.json(module.lessons.map(toLessonDto));
    }),
  );

  return router;
}

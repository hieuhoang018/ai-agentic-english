import { NotFoundError, PathDefinition, ValidationError, asyncHandler } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { Prisma } from '../../prisma/generated/client';
import { AppPrismaClient } from '../lib/prisma';
import { toExerciseInternalDto, toLearningPathDto } from '../lib/mappers';

export function createInternalRouter(prisma: AppPrismaClient): Router {
  const router = Router();

  router.get(
    '/exercises/:id',
    asyncHandler(async (req, res) => {
      const exercise = await prisma.exercise.findUnique({ where: { id: req.params.id } });
      if (!exercise) throw new NotFoundError('Exercise not found');
      res.json(toExerciseInternalDto(exercise));
    }),
  );

  router.get(
    '/learning-paths/:id',
    asyncHandler(async (req, res) => {
      const path = await prisma.learningPath.findUnique({ where: { id: req.params.id } });
      if (!path) throw new NotFoundError('Learning path not found');
      res.json(toLearningPathDto(path));
    }),
  );

  router.post(
    '/learning-paths',
    asyncHandler(async (req, res) => {
      const { userId, pathDefinition } = req.body as {
        userId?: string;
        pathDefinition?: PathDefinition;
      };

      if (!userId || typeof userId !== 'string') {
        throw new ValidationError('userId is required');
      }
      if (!pathDefinition || typeof pathDefinition !== 'object') {
        throw new ValidationError('pathDefinition is required');
      }

      const existing = await prisma.learningPath.findFirst({
        where: { userId, status: 'active' },
        orderBy: { version: 'desc' },
      });

      const nextVersion = existing ? existing.version + 1 : 1;

      const [, created] = await Promise.all([
        existing
          ? prisma.learningPath.update({
              where: { id: existing.id },
              data: { status: 'superseded' },
            })
          : Promise.resolve(null),
        prisma.learningPath.create({
          data: { userId, version: nextVersion, status: 'active', pathDefinition: pathDefinition as unknown as Prisma.InputJsonValue },
        }),
      ]);

      res.status(201).json(toLearningPathDto(created));
    }),
  );

  router.get(
    '/catalog/summary',
    asyncHandler(async (_req, res) => {
      const modules = await prisma.module.findMany({
        include: { lessons: { include: { exercises: { select: { id: true } } } } },
        orderBy: { order: 'asc' },
      });

      let totalLessons = 0;
      let totalExercises = 0;

      const moduleSummaries = modules.map((m) => {
        const lessonCount = m.lessons.length;
        const exerciseCount = m.lessons.reduce((sum, l) => sum + l.exercises.length, 0);
        totalLessons += lessonCount;
        totalExercises += exerciseCount;
        return {
          id: m.id,
          title: m.title,
          cefrLevel: m.cefrLevel,
          skillFocus: m.skillFocus,
          lessonCount,
          exerciseCount,
        };
      });

      res.json({
        modules: moduleSummaries,
        totalModules: modules.length,
        totalLessons,
        totalExercises,
      });
    }),
  );

  return router;
}

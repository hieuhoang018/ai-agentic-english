import { NotFoundError, asyncHandler, requireAuth } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { AppPrismaClient } from '../lib/prisma';
import { toExerciseDto, toLessonDto } from '../lib/mappers';

export function createLessonsRouter(prisma: AppPrismaClient): Router {
  const router = Router();

  router.get(
    '/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const lesson = await prisma.lesson.findUnique({ where: { id: req.params.id } });
      if (!lesson) throw new NotFoundError('Lesson not found');
      res.json(toLessonDto(lesson));
    }),
  );

  router.get(
    '/:id/exercises',
    requireAuth,
    asyncHandler(async (req, res) => {
      const lesson = await prisma.lesson.findUnique({ where: { id: req.params.id } });
      if (!lesson) throw new NotFoundError('Lesson not found');

      const exercises = await prisma.exercise.findMany({
        where: { lessonId: req.params.id },
        orderBy: { createdAt: 'asc' },
      });
      res.json(exercises.map(toExerciseDto));
    }),
  );

  return router;
}

import {
  CreateLearnerModelInput,
  InitializeProgressInput,
  ReminderContextDto,
  ValidationError,
  asyncHandler,
} from '@ai-agentic-english/shared';
import { Router } from 'express';
import { Prisma } from '../../prisma/generated/client';
import { upsertLearnerModel } from '../lib/learnerModel';
import { AppPrismaClient } from '../lib/prisma';
import { toLearnerModelDto, toProgressDto } from '../lib/mappers';

export function createInternalRouter(prisma: AppPrismaClient): Router {
  const router = Router();

  router.post(
    '/learner-models',
    asyncHandler(async (req, res) => {
      const model = await upsertLearnerModel(prisma, req.body as CreateLearnerModelInput);
      res.status(201).json(toLearnerModelDto(model));
    }),
  );

  router.post(
    '/progress/:userId/initialize',
    asyncHandler(async (req, res) => {
      const { pathId, currentModuleId, currentLessonId, currentExerciseId } = req.body as InitializeProgressInput;

      if (!pathId || typeof pathId !== 'string') {
        throw new ValidationError('pathId is required');
      }

      const data = {
        pathId,
        currentModuleId: currentModuleId ?? null,
        currentLessonId: currentLessonId ?? null,
        currentExerciseId: currentExerciseId ?? null,
        completedExerciseIds: [] as Prisma.InputJsonValue,
      };

      const progress = await prisma.progress.upsert({
        where: { userId: req.params.userId },
        create: { userId: req.params.userId, ...data },
        update: data,
      });

      res.status(201).json(toProgressDto(progress));
    }),
  );

  router.get(
    '/reminders/:userId/context',
    asyncHandler(async (req, res) => {
      const { userId } = req.params;

      const dueReviewCount = await prisma.reviewSchedule.count({
        where: { userId, due: { lte: new Date() } },
      });

      const nextDueVocabSchedule = await prisma.reviewSchedule.findFirst({
        where: { userId, itemType: 'vocab' },
        orderBy: { due: 'asc' },
      });

      const vocabItem = nextDueVocabSchedule
        ? await prisma.vocabItem.findUnique({ where: { id: nextDueVocabSchedule.itemId } })
        : null;

      const context: ReminderContextDto = {
        userId,
        dueReviewCount,
        vocabOfTheDay: vocabItem
          ? {
              vocabItemId: vocabItem.id,
              term: vocabItem.term,
              meaning: vocabItem.meaning,
              exampleSentence: vocabItem.exampleSentence ?? null,
            }
          : null,
      };

      res.json(context);
    }),
  );

  return router;
}

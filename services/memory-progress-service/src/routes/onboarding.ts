import { CefrLevel, LearningPathDto, Skill, asyncHandler, requireAuth } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { AiTutorClient } from '../lib/aiTutorClient';
import { upsertLearnerModel } from '../lib/learnerModel';
import { AppPrismaClient } from '../lib/prisma';

interface OnboardingInput {
  currentLevel: Partial<Record<Skill, CefrLevel>>;
  dailyTimeBudgetMinutes: number;
  goals: string[];
  weakAreas?: string[];
}

export function createOnboardingRouter(prisma: AppPrismaClient, aiTutor: AiTutorClient): Router {
  const router = Router();

  router.post(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = req.auth!.userId;
      const { currentLevel, dailyTimeBudgetMinutes, goals, weakAreas } = req.body as OnboardingInput;

      await upsertLearnerModel(prisma, { userId, currentLevel, dailyTimeBudgetMinutes, goals, weakAreas });

      const path: LearningPathDto = await aiTutor.generatePath({ userId, currentLevel, dailyTimeBudgetMinutes, goals });

      res.status(201).json(path);
    }),
  );

  return router;
}

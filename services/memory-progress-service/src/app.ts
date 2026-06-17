import { createInternalMiddleware, errorHandler, getEnv } from '@ai-agentic-english/shared';
import cors from 'cors';
import express, { Express } from 'express';
import { PrismaClient } from '../prisma/generated/client';
import { HighlightContentGenerator, createStubHighlightContentGenerator } from './lib/highlightContentGenerator';
import { LearningMaterialsClient, createLearningMaterialsClient } from './lib/learningMaterialsClient';
import { AppPrismaClient } from './lib/prisma';
import { createExercisesRouter } from './routes/exercises';
import { createInternalRouter } from './routes/internal';
import { createLearnerModelsRouter } from './routes/learnerModels';
import { createReviewCenterRouter } from './routes/reviewCenter';

export function createApp(
  prisma: AppPrismaClient = new PrismaClient(),
  learningMaterials: LearningMaterialsClient = createLearningMaterialsClient(),
  highlightContentGenerator: HighlightContentGenerator = createStubHighlightContentGenerator(),
): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ok', service: 'memory-progress-service' });
    } catch (_error) {
      res.status(503).json({ status: 'error', service: 'memory-progress-service' });
    }
  });

  app.use('/learner-models', createLearnerModelsRouter(prisma));
  app.use('/exercises', createExercisesRouter(prisma, learningMaterials));
  app.use('/review-center', createReviewCenterRouter(prisma, highlightContentGenerator));

  const internalSecret = getEnv('INTERNAL_SECRET', 'dev-internal-secret');
  app.use('/internal', createInternalMiddleware(internalSecret), createInternalRouter(prisma));

  app.use(errorHandler);

  return app;
}

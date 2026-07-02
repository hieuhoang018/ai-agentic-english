import { createInternalMiddleware, errorHandler, getEnv } from '@ai-agentic-english/shared';
import cors from 'cors';
import express, { Express } from 'express';
import { PrismaClient } from '../prisma/generated/client';
import { AppPrismaClient } from './lib/prisma';
import { StorageClient, createStorageClient } from './lib/storageClient';
import { createAssessmentRouter } from './routes/assessment';
import { createAudioRouter } from './routes/audio';
import { createExercisesRouter } from './routes/exercises';
import { createInternalRouter } from './routes/internal';
import { createLearningPathsRouter } from './routes/learningPaths';
import { createLessonsRouter } from './routes/lessons';
import { createModulesRouter } from './routes/modules';
import { createReviewRouter } from './routes/review';

export interface HealthCheckClient {
  $queryRaw: PrismaClient['$queryRaw'];
}

export function createApp(
  prisma: AppPrismaClient = new PrismaClient(),
  storage: StorageClient = createStorageClient(),
): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ok', service: 'learning-materials-service' });
    } catch (_error) {
      res.status(503).json({ status: 'error', service: 'learning-materials-service' });
    }
  });

  app.use('/modules', createModulesRouter(prisma));
  app.use('/lessons', createLessonsRouter(prisma));
  app.use('/exercises', createExercisesRouter(prisma));
  app.use('/assessment', createAssessmentRouter(prisma));
  app.use('/learning-paths', createLearningPathsRouter(prisma));
  app.use('/audio', createAudioRouter(storage));
  app.use('/review', createReviewRouter(prisma));

  const internalSecret = getEnv('INTERNAL_SECRET', 'dev-internal-secret');
  app.use('/internal', createInternalMiddleware(internalSecret), createInternalRouter(prisma));

  app.use(errorHandler);

  return app;
}

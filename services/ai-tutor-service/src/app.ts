import { EventBus, LlmClient, createInternalMiddleware, createKafkaEventBus, createLlmClient, errorHandler, getEnv } from '@ai-agentic-english/shared';
import cors from 'cors';
import express, { Express } from 'express';
import { PrismaClient } from '../prisma/generated/client';
import { LearningMaterialsClient, createLearningMaterialsClient } from './lib/learningMaterialsClient';
import { MemoryProgressClient, createMemoryProgressClient } from './lib/memoryProgressClient';
import { CacheClient, createRedisCacheClient } from './lib/redisCache';
import { createGradingRouter } from './routes/grading';
import { createHighlightsRouter } from './routes/highlights';
import { createOnboardingRouter } from './routes/onboarding';

export interface HealthCheckClient {
  $queryRaw: PrismaClient['$queryRaw'];
}

export function createApp(
  prisma: HealthCheckClient = new PrismaClient(),
  llmClient: LlmClient = createLlmClient(),
  eventBus: EventBus = createKafkaEventBus(getEnv('KAFKA_BROKERS', 'localhost:9092').split(',')),
  cacheClient: CacheClient = createRedisCacheClient(),
  learningMaterials: LearningMaterialsClient = createLearningMaterialsClient(),
  memoryProgress: MemoryProgressClient = createMemoryProgressClient(),
): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ok', service: 'ai-tutor-service' });
    } catch (_error) {
      res.status(503).json({ status: 'error', service: 'ai-tutor-service' });
    }
  });

  app.use('/grading', createGradingRouter(llmClient, learningMaterials, eventBus));

  const internalSecret = getEnv('INTERNAL_SECRET', 'dev-internal-secret');
  app.use(
    '/internal',
    createInternalMiddleware(internalSecret),
    createOnboardingRouter(llmClient, learningMaterials, memoryProgress, eventBus),
    createHighlightsRouter(llmClient, cacheClient),
  );

  app.use(errorHandler);

  return app;
}

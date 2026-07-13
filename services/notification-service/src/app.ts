import { errorHandler } from '@ai-agentic-english/shared';
import cors from 'cors';
import express, { Express } from 'express';
import { PrismaClient } from '../prisma/generated/client';
import { AppPrismaClient } from './lib/prisma';
import { createPushSubscriptionsRouter } from './routes/pushSubscriptions';

export function createApp(prisma: AppPrismaClient = new PrismaClient()): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ok', service: 'notification-service' });
    } catch (_error) {
      res.status(503).json({ status: 'error', service: 'notification-service' });
    }
  });

  app.use('/push-subscriptions', createPushSubscriptionsRouter(prisma));

  app.use(errorHandler);

  return app;
}

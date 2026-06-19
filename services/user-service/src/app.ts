import { EventBus, InMemoryEventBus, errorHandler } from '@ai-agentic-english/shared';
import { PrismaClient } from '../prisma/generated/client';
import cors from 'cors';
import express, { Express } from 'express';
import { AppPrismaClient } from './lib/prisma';
import { createUsersRouter } from './routes/users';
import { createWebhooksRouter } from './routes/webhooks';

export function createApp(
  prisma: AppPrismaClient = new PrismaClient(),
  eventBus: EventBus = new InMemoryEventBus(),
): Express {
  const app = express();

  app.use(cors());

  // Mounted before express.json() so the raw body is available for Svix
  // signature verification.
  app.use('/webhooks', createWebhooksRouter(prisma, eventBus));

  app.use(express.json());

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ok', service: 'user-service' });
    } catch (_error) {
      res.status(503).json({ status: 'error', service: 'user-service' });
    }
  });

  app.use('/users', createUsersRouter(prisma));

  app.use(errorHandler);

  return app;
}

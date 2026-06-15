import cors from 'cors';
import express, { Express } from 'express';
import { PrismaClient } from '../prisma/generated/client';

export interface HealthCheckClient {
  $queryRaw: PrismaClient['$queryRaw'];
}

export function createApp(prisma: HealthCheckClient = new PrismaClient()): Express {
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

  return app;
}

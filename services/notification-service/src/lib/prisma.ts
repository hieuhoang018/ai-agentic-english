import { PrismaClient } from '../../prisma/generated/client';

export interface AppPrismaClient {
  $queryRaw: PrismaClient['$queryRaw'];
  processedEvent: PrismaClient['processedEvent'];
  scheduledReminderRun: PrismaClient['scheduledReminderRun'];
}

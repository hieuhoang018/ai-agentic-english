import { PrismaClient } from '../../prisma/generated/client';

export interface AppPrismaClient {
  $queryRaw: PrismaClient['$queryRaw'];
  learnerModel: PrismaClient['learnerModel'];
  progress: PrismaClient['progress'];
  reviewSchedule: PrismaClient['reviewSchedule'];
  mistake: PrismaClient['mistake'];
  attempt: PrismaClient['attempt'];
  vocabItem: PrismaClient['vocabItem'];
}

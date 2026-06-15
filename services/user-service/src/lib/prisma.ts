import { PrismaClient } from '../../prisma/generated/client';

export interface AppPrismaClient {
  $queryRaw: PrismaClient['$queryRaw'];
  user: PrismaClient['user'];
  userSettings: PrismaClient['userSettings'];
}

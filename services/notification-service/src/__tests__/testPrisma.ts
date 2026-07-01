import { vi } from 'vitest';
import { AppPrismaClient } from '../lib/prisma';

export type MockPrismaClient = AppPrismaClient & {
  $queryRaw: ReturnType<typeof vi.fn>;
  processedEvent: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  scheduledReminderRun: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

export function createMockPrisma(): MockPrismaClient {
  return {
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
    processedEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    scheduledReminderRun: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  } as unknown as MockPrismaClient;
}

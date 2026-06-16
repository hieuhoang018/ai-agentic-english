import { vi } from 'vitest';
import { AppPrismaClient } from '../lib/prisma';

export type MockPrismaClient = AppPrismaClient & {
  $queryRaw: ReturnType<typeof vi.fn>;
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  userSettings: { upsert: ReturnType<typeof vi.fn> };
};

export function createMockPrisma(): MockPrismaClient {
  return {
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
    user: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    userSettings: {
      upsert: vi.fn(),
    },
  } as unknown as MockPrismaClient;
}

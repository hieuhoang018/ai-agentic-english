import { vi } from 'vitest';
import { AppPrismaClient } from '../lib/prisma';

export type MockPrismaClient = {
  $queryRaw: ReturnType<typeof vi.fn>;
  learnerModel: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  progress: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  reviewSchedule: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  mistake: {
    createMany: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
  attempt: {
    create: ReturnType<typeof vi.fn>;
  };
  vocabItem: {
    findMany: ReturnType<typeof vi.fn>;
  };
} & AppPrismaClient;

export function createMockPrisma(): MockPrismaClient {
  return {
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
    learnerModel: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    progress: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    reviewSchedule: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    mistake: {
      createMany: vi.fn(),
      groupBy: vi.fn(),
    },
    attempt: {
      create: vi.fn(),
    },
    vocabItem: {
      findMany: vi.fn(),
    },
  } as unknown as MockPrismaClient;
}

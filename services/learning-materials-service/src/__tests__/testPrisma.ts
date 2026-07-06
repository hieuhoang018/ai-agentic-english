import { vi } from 'vitest';
import { AppPrismaClient } from '../lib/prisma';

export type MockPrismaClient = {
  $queryRaw: ReturnType<typeof vi.fn>;
  module: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  lesson: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  exercise: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  learningPath: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  assessmentQuestion: {
    findMany: ReturnType<typeof vi.fn>;
  };
  vocabEntry: { findMany: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn> };
  grammarPoint: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  passage: { findMany: ReturnType<typeof vi.fn> };
} & AppPrismaClient;

export function createMockPrisma(): MockPrismaClient {
  return {
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
    module: { findMany: vi.fn(), findUnique: vi.fn() },
    lesson: { findMany: vi.fn(), findUnique: vi.fn() },
    exercise: { findMany: vi.fn(), findUnique: vi.fn() },
    learningPath: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    assessmentQuestion: { findMany: vi.fn() },
    vocabEntry: { findMany: vi.fn(async () => []), groupBy: vi.fn(async () => []) },
    grammarPoint: { findMany: vi.fn(async () => []), findUnique: vi.fn() },
    passage: { findMany: vi.fn(async () => []) },
  } as unknown as MockPrismaClient;
}

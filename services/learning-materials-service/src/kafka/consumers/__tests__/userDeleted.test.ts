import { UserDeletedEvent } from '@ai-agentic-english/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMockPrisma, MockPrismaClient } from '../../../__tests__/testPrisma';
import { handleUserDeleted } from '../userDeleted';

function baseEvent(overrides: Partial<UserDeletedEvent> = {}): UserDeletedEvent {
  return {
    eventId: 'evt-1',
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    type: 'user.deleted',
    userId: 'user_123',
    ...overrides,
  };
}

describe('handleUserDeleted', () => {
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('deletes all learning paths owned by the deleted user', async () => {
    await handleUserDeleted(prisma, baseEvent());

    expect(prisma.learningPath.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_123' } });
  });
});

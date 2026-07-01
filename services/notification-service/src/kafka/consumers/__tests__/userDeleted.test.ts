import { MockNovuClient, UserDeletedEvent } from '@ai-agentic-english/shared';
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
  let novuClient: MockNovuClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    novuClient = new MockNovuClient();
    prisma.processedEvent.findUnique.mockResolvedValue(null);
  });

  it('deletes the user scheduled reminder runs and removes the Novu subscriber', async () => {
    await handleUserDeleted(prisma, novuClient, baseEvent());

    expect(prisma.scheduledReminderRun.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_123' } });
    expect(novuClient.deletedSubscribers).toEqual(['user_123']);
  });

  it('skips processing when the event was already handled (dedup)', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue({ eventId: 'evt-1', processedAt: new Date() });

    await handleUserDeleted(prisma, novuClient, baseEvent());

    expect(prisma.scheduledReminderRun.deleteMany).not.toHaveBeenCalled();
    expect(novuClient.deletedSubscribers).toEqual([]);
  });
});

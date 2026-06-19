import { MockNovuClient, UserUpsertedEvent } from '@ai-agentic-english/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMockPrisma, MockPrismaClient } from '../../../__tests__/testPrisma';
import { handleUserUpserted } from '../userUpserted';

function baseEvent(overrides: Partial<UserUpsertedEvent> = {}): UserUpsertedEvent {
  return {
    eventId: 'evt-1',
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    type: 'user.upserted',
    userId: 'user_123',
    email: 'jane@example.com',
    name: 'Jane Doe',
    action: 'created',
    ...overrides,
  };
}

describe('handleUserUpserted', () => {
  let prisma: MockPrismaClient;
  let novuClient: MockNovuClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    novuClient = new MockNovuClient();
    prisma.processedEvent.findUnique.mockResolvedValue(null);
  });

  it('upserts the Novu subscriber and records the processed event', async () => {
    await handleUserUpserted(prisma, novuClient, baseEvent());

    expect(novuClient.upsertedSubscribers).toEqual([{ subscriberId: 'user_123', email: 'jane@example.com', name: 'Jane Doe' }]);
    expect(prisma.processedEvent.create).toHaveBeenCalledWith({ data: { eventId: 'evt-1' } });
  });

  it('skips processing when the event was already handled (dedup)', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue({ eventId: 'evt-1', processedAt: new Date() });

    await handleUserUpserted(prisma, novuClient, baseEvent());

    expect(novuClient.upsertedSubscribers).toEqual([]);
    expect(prisma.processedEvent.create).not.toHaveBeenCalled();
  });
});

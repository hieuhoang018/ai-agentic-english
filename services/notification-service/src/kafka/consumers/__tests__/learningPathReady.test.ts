import { LearningPathReadyEvent, MockNovuClient } from '@ai-agentic-english/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMockPrisma, MockPrismaClient } from '../../../__tests__/testPrisma';
import { handleLearningPathReady } from '../learningPathReady';

function baseEvent(overrides: Partial<LearningPathReadyEvent> = {}): LearningPathReadyEvent {
  return {
    eventId: 'evt-1',
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    type: 'learning-path.ready',
    userId: 'user_123',
    pathId: 'path-1',
    ...overrides,
  };
}

describe('handleLearningPathReady', () => {
  let prisma: MockPrismaClient;
  let novuClient: MockNovuClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    novuClient = new MockNovuClient();
    prisma.processedEvent.findUnique.mockResolvedValue(null);
  });

  it('triggers the learning-path-ready workflow and records the processed event', async () => {
    await handleLearningPathReady(prisma, novuClient, baseEvent());

    expect(novuClient.triggeredNotifications).toEqual([
      { workflowId: 'learning-path-ready', subscriberId: 'user_123', payload: { pathId: 'path-1' } },
    ]);
    expect(prisma.processedEvent.create).toHaveBeenCalledWith({ data: { eventId: 'evt-1' } });
  });

  it('skips processing when the event was already handled (dedup)', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue({ eventId: 'evt-1', processedAt: new Date() });

    await handleLearningPathReady(prisma, novuClient, baseEvent());

    expect(novuClient.triggeredNotifications).toEqual([]);
  });
});

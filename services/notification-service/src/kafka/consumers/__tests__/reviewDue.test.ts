import { MockNovuClient, ReviewDueEvent } from '@ai-agentic-english/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMockPrisma, MockPrismaClient } from '../../../__tests__/testPrisma';
import { handleReviewDue } from '../reviewDue';

function baseEvent(overrides: Partial<ReviewDueEvent> = {}): ReviewDueEvent {
  return {
    eventId: 'evt-1',
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    type: 'review.due',
    userId: 'user_123',
    dueCount: 5,
    itemTypes: ['exercise', 'vocab'],
    ...overrides,
  };
}

describe('handleReviewDue', () => {
  let prisma: MockPrismaClient;
  let novuClient: MockNovuClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    novuClient = new MockNovuClient();
    prisma.processedEvent.findUnique.mockResolvedValue(null);
  });

  it('triggers the review-due workflow with the due count and item types', async () => {
    await handleReviewDue(prisma, novuClient, baseEvent());

    expect(novuClient.triggeredNotifications).toEqual([
      { workflowId: 'review-due', subscriberId: 'user_123', payload: { dueCount: 5, itemTypes: ['exercise', 'vocab'] } },
    ]);
  });

  it('skips processing when the event was already handled (dedup)', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue({ eventId: 'evt-1', processedAt: new Date() });

    await handleReviewDue(prisma, novuClient, baseEvent());

    expect(novuClient.triggeredNotifications).toEqual([]);
  });
});

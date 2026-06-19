import { AchievementUnlockedEvent, MockNovuClient } from '@ai-agentic-english/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMockPrisma, MockPrismaClient } from '../../../__tests__/testPrisma';
import { handleAchievementUnlocked } from '../achievementUnlocked';

function baseEvent(overrides: Partial<AchievementUnlockedEvent> = {}): AchievementUnlockedEvent {
  return {
    eventId: 'evt-1',
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    type: 'achievement.unlocked',
    userId: 'user_123',
    achievementType: 'first-lesson',
    ...overrides,
  };
}

describe('handleAchievementUnlocked', () => {
  let prisma: MockPrismaClient;
  let novuClient: MockNovuClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    novuClient = new MockNovuClient();
    prisma.processedEvent.findUnique.mockResolvedValue(null);
  });

  it('triggers the achievement-unlocked workflow with the achievement type', async () => {
    await handleAchievementUnlocked(prisma, novuClient, baseEvent());

    expect(novuClient.triggeredNotifications).toEqual([
      { workflowId: 'achievement-unlocked', subscriberId: 'user_123', payload: { achievementType: 'first-lesson', metadata: undefined } },
    ]);
  });

  it('skips processing when the event was already handled (dedup)', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue({ eventId: 'evt-1', processedAt: new Date() });

    await handleAchievementUnlocked(prisma, novuClient, baseEvent());

    expect(novuClient.triggeredNotifications).toEqual([]);
  });
});

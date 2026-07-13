import { AchievementUnlockedEvent, MockNovuClient } from '@ai-agentic-english/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMockPrisma, MockPrismaClient } from '../../../__tests__/testPrisma';
import { MockWebPushSender } from '../../../lib/webPush';
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
  let webPushSender: MockWebPushSender;

  beforeEach(() => {
    prisma = createMockPrisma();
    novuClient = new MockNovuClient();
    webPushSender = new MockWebPushSender();
    prisma.processedEvent.findUnique.mockResolvedValue(null);
  });

  it('triggers the achievement-unlocked workflow with the achievement type', async () => {
    await handleAchievementUnlocked(prisma, novuClient, webPushSender, baseEvent());

    expect(novuClient.triggeredNotifications).toEqual([
      { workflowId: 'achievement-unlocked', subscriberId: 'user_123', payload: { achievementType: 'first-lesson', metadata: undefined } },
    ]);
    expect(webPushSender.sent).toEqual([
      { clerkUserId: 'user_123', payload: { title: 'Bạn vừa đạt thành tích mới!', body: 'first-lesson', url: '/main/homepage' } },
    ]);
  });

  it('skips processing when the event was already handled (dedup)', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue({ eventId: 'evt-1', processedAt: new Date() });

    await handleAchievementUnlocked(prisma, novuClient, webPushSender, baseEvent());

    expect(novuClient.triggeredNotifications).toEqual([]);
    expect(webPushSender.sent).toEqual([]);
  });
});

import { MockNovuClient, UserSummaryDto } from '@ai-agentic-english/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockPrisma, MockPrismaClient } from '../../__tests__/testPrisma';
import { MemoryProgressClient } from '../../lib/memoryProgressClient';
import { UserServiceClient } from '../../lib/userServiceClient';
import { runVocabOfTheDay } from '../vocabOfTheDay';

const user: UserSummaryDto = {
  clerkUserId: 'user_123',
  email: 'jane@example.com',
  name: 'Jane Doe',
  settings: {
    dailyTimeBudgetMinutes: 20,
    preferredLanguage: 'en',
    reminderTime: '08:00',
    timezone: 'UTC',
    notificationChannelHints: {},
  },
};

const vocabOfTheDay = {
  vocabItemId: 'vocab-1',
  term: 'ubiquitous',
  meaning: 'present everywhere',
  exampleSentence: 'Smartphones are ubiquitous nowadays.',
};

describe('runVocabOfTheDay', () => {
  let prisma: MockPrismaClient;
  let userServiceClient: UserServiceClient;
  let memoryProgressClient: MemoryProgressClient;
  let novuClient: MockNovuClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    novuClient = new MockNovuClient();
    userServiceClient = { listUsers: vi.fn().mockResolvedValue([user]) };
    memoryProgressClient = { getReminderContext: vi.fn().mockResolvedValue({ userId: 'user_123', dueReviewCount: 0, vocabOfTheDay }) };
    prisma.scheduledReminderRun.findUnique.mockResolvedValue(null);
  });

  it('triggers the vocab-of-the-day workflow and records the run', async () => {
    const now = new Date('2024-01-10T08:00:00.000Z');

    await runVocabOfTheDay(now, prisma, userServiceClient, memoryProgressClient, novuClient);

    expect(novuClient.triggeredNotifications).toEqual([
      { workflowId: 'vocab-of-the-day', subscriberId: 'user_123', payload: vocabOfTheDay },
    ]);
    expect(prisma.scheduledReminderRun.create).toHaveBeenCalledWith({
      data: { userId: 'user_123', reminderType: 'vocab-of-the-day', runDate: '2024-01-10' },
    });
  });

  it('does not trigger when there is no vocab due', async () => {
    memoryProgressClient.getReminderContext = vi.fn().mockResolvedValue({ userId: 'user_123', dueReviewCount: 0, vocabOfTheDay: null });
    const now = new Date('2024-01-10T08:00:00.000Z');

    await runVocabOfTheDay(now, prisma, userServiceClient, memoryProgressClient, novuClient);

    expect(novuClient.triggeredNotifications).toEqual([]);
    expect(prisma.scheduledReminderRun.create).not.toHaveBeenCalled();
  });

  it('does not trigger twice for the same calendar day (dedup)', async () => {
    prisma.scheduledReminderRun.findUnique.mockResolvedValue({
      id: 'run-1',
      userId: 'user_123',
      reminderType: 'vocab-of-the-day',
      runDate: '2024-01-10',
      sentAt: new Date(),
    });
    const now = new Date('2024-01-10T08:00:00.000Z');

    await runVocabOfTheDay(now, prisma, userServiceClient, memoryProgressClient, novuClient);

    expect(novuClient.triggeredNotifications).toEqual([]);
  });
});

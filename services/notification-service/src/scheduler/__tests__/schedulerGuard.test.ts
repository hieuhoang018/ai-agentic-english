import { MockNovuClient, ReminderContextDto, UserSummaryDto } from '@ai-agentic-english/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockPrisma, MockPrismaClient } from '../../__tests__/testPrisma';
import { ReminderContextClient } from '../../lib/reminderContextClient';
import { UserServiceClient } from '../../lib/userServiceClient';
import { withScheduledReminder } from '../schedulerGuard';

const user: UserSummaryDto = {
  clerkUserId: 'user_abc',
  email: 'test@example.com',
  name: 'Test User',
  settings: {
    dailyTimeBudgetMinutes: 15,
    preferredLanguage: 'en',
    reminderTime: '09:00',
    timezone: 'UTC',
    notificationChannelHints: {},
  },
};

const context: ReminderContextDto = { userId: 'user_abc', dueReviewCount: 2, vocabOfTheDay: null };

describe('withScheduledReminder', () => {
  let prisma: MockPrismaClient;
  let userServiceClient: UserServiceClient;
  let reminderContextClient: MemoryProgressClient;
  let novuClient: MockNovuClient;
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = createMockPrisma();
    novuClient = new MockNovuClient();
    userServiceClient = { listUsers: vi.fn().mockResolvedValue([user]) };
    reminderContextClient = { getReminderContext: vi.fn().mockResolvedValue(context) };
    handler = vi.fn().mockResolvedValue(true);
    prisma.scheduledReminderRun.findUnique.mockResolvedValue(null);
  });

  it('calls handler with userId and context when time matches and not yet sent', async () => {
    const now = new Date('2024-03-15T09:00:00.000Z');

    await withScheduledReminder('test-reminder', now, prisma, userServiceClient, reminderContextClient, novuClient, handler);

    expect(handler).toHaveBeenCalledWith('user_abc', context, novuClient);
    expect(prisma.scheduledReminderRun.create).toHaveBeenCalledWith({
      data: { userId: 'user_abc', reminderType: 'test-reminder', runDate: '2024-03-15' },
    });
  });

  it('skips handler and dedup write when local time does not match reminderTime', async () => {
    const now = new Date('2024-03-15T10:00:00.000Z');

    await withScheduledReminder('test-reminder', now, prisma, userServiceClient, reminderContextClient, novuClient, handler);

    expect(handler).not.toHaveBeenCalled();
    expect(prisma.scheduledReminderRun.create).not.toHaveBeenCalled();
  });

  it('skips handler and dedup write when already sent today', async () => {
    prisma.scheduledReminderRun.findUnique.mockResolvedValue({
      id: 'r1', userId: 'user_abc', reminderType: 'test-reminder', runDate: '2024-03-15', sentAt: new Date(),
    });
    const now = new Date('2024-03-15T09:00:00.000Z');

    await withScheduledReminder('test-reminder', now, prisma, userServiceClient, reminderContextClient, novuClient, handler);

    expect(handler).not.toHaveBeenCalled();
    expect(prisma.scheduledReminderRun.create).not.toHaveBeenCalled();
  });

  it('calls handler but skips dedup write when handler returns false', async () => {
    handler.mockResolvedValue(false);
    const now = new Date('2024-03-15T09:00:00.000Z');

    await withScheduledReminder('test-reminder', now, prisma, userServiceClient, reminderContextClient, novuClient, handler);

    expect(handler).toHaveBeenCalled();
    expect(prisma.scheduledReminderRun.create).not.toHaveBeenCalled();
  });

  it('skips users without a reminderTime configured', async () => {
    userServiceClient.listUsers = vi.fn().mockResolvedValue([
      { ...user, settings: { ...user.settings, reminderTime: null } },
    ]);
    const now = new Date('2024-03-15T09:00:00.000Z');

    await withScheduledReminder('test-reminder', now, prisma, userServiceClient, reminderContextClient, novuClient, handler);

    expect(handler).not.toHaveBeenCalled();
  });
});

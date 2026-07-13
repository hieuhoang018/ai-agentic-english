import { MockNovuClient, UserSummaryDto } from '@ai-agentic-english/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockPrisma, MockPrismaClient } from '../../__tests__/testPrisma';
import { ReminderContextClient } from '../../lib/reminderContextClient';
import { UserServiceClient } from '../../lib/userServiceClient';
import { MockWebPushSender } from '../../lib/webPush';
import { runDailyReminder } from '../dailyReminder';

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

describe('runDailyReminder', () => {
  let prisma: MockPrismaClient;
  let userServiceClient: UserServiceClient;
  let reminderContextClient: ReminderContextClient;
  let novuClient: MockNovuClient;
  let webPushSender: MockWebPushSender;

  beforeEach(() => {
    prisma = createMockPrisma();
    novuClient = new MockNovuClient();
    webPushSender = new MockWebPushSender();
    userServiceClient = { listUsers: vi.fn().mockResolvedValue([user]) };
    reminderContextClient = { getReminderContext: vi.fn().mockResolvedValue({ userId: 'user_123', dueReviewCount: 3, vocabOfTheDay: null }) };
    prisma.scheduledReminderRun.findUnique.mockResolvedValue(null);
  });

  it('triggers the daily reminder when local time matches reminderTime and records the run', async () => {
    const now = new Date('2024-01-10T08:00:00.000Z'); // UTC matches user's "08:00" reminderTime in UTC tz

    await runDailyReminder(now, prisma, userServiceClient, reminderContextClient, novuClient, webPushSender);

    expect(novuClient.triggeredNotifications).toEqual([
      { workflowId: 'daily-reminder', subscriberId: 'user_123', payload: { dueReviewCount: 3 } },
    ]);
    expect(prisma.scheduledReminderRun.create).toHaveBeenCalledWith({
      data: { userId: 'user_123', reminderType: 'daily-reminder', runDate: '2024-01-10' },
    });
    expect(webPushSender.sent).toEqual([
      {
        clerkUserId: 'user_123',
        payload: {
          title: 'Nhắc nhở học tập',
          body: 'Bạn có 3 từ vựng đến hạn ôn tập hôm nay.',
          url: '/main/review-center/due',
        },
      },
    ]);
  });

  it('does not trigger when local time does not match reminderTime', async () => {
    const now = new Date('2024-01-10T09:00:00.000Z');

    await runDailyReminder(now, prisma, userServiceClient, reminderContextClient, novuClient, webPushSender);

    expect(novuClient.triggeredNotifications).toEqual([]);
  });

  it('does not trigger twice for the same calendar day (dedup)', async () => {
    prisma.scheduledReminderRun.findUnique.mockResolvedValue({
      id: 'run-1',
      userId: 'user_123',
      reminderType: 'daily-reminder',
      runDate: '2024-01-10',
      sentAt: new Date(),
    });
    const now = new Date('2024-01-10T08:00:00.000Z');

    await runDailyReminder(now, prisma, userServiceClient, reminderContextClient, novuClient, webPushSender);

    expect(novuClient.triggeredNotifications).toEqual([]);
  });

  it('skips users without a reminderTime configured', async () => {
    userServiceClient.listUsers = vi.fn().mockResolvedValue([{ ...user, settings: { ...user.settings, reminderTime: null } }]);
    const now = new Date('2024-01-10T08:00:00.000Z');

    await runDailyReminder(now, prisma, userServiceClient, reminderContextClient, novuClient, webPushSender);

    expect(novuClient.triggeredNotifications).toEqual([]);
  });
});

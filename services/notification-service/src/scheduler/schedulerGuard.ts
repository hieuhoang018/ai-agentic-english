import { NovuClient, ReminderContextDto, UserSummaryDto } from '@ai-agentic-english/shared';
import { ReminderContextClient } from '../lib/reminderContextClient';
import { AppPrismaClient } from '../lib/prisma';
import { UserServiceClient } from '../lib/userServiceClient';
import { formatTimeInZone, getLocalDateKey } from './time';

export type ReminderHandler = (
  userId: string,
  context: ReminderContextDto,
  novuClient: NovuClient,
) => Promise<boolean>;

// Bounded concurrency for per-user reminder work (dedup check + AGT-07 HTTP call + handler).
// Keeps the hourly cron tick from firing an unbounded number of simultaneous requests while
// still avoiding fully sequential one-at-a-time processing.
const REMINDER_CONCURRENCY = 10;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function withScheduledReminder(
  reminderType: string,
  now: Date,
  prisma: AppPrismaClient,
  userServiceClient: UserServiceClient,
  reminderContextClient: ReminderContextClient,
  novuClient: NovuClient,
  handler: ReminderHandler,
): Promise<void> {
  const users = await userServiceClient.listUsers();

  const matchedUsers = users.filter((user) => {
    const { reminderTime, timezone } = user.settings;
    return Boolean(reminderTime) && formatTimeInZone(now, timezone) === reminderTime;
  });

  const processUser = async (user: UserSummaryDto): Promise<void> => {
    const { timezone } = user.settings;
    const runDate = getLocalDateKey(now, timezone);
    const alreadySent = await prisma.scheduledReminderRun.findUnique({
      where: { userId_reminderType_runDate: { userId: user.clerkUserId, reminderType, runDate } },
    });
    if (alreadySent) return;

    const context = await reminderContextClient.getReminderContext(user.clerkUserId);
    const notified = await handler(user.clerkUserId, context, novuClient);

    if (notified) {
      await prisma.scheduledReminderRun.create({
        data: { userId: user.clerkUserId, reminderType, runDate },
      });
    }
  };

  for (const batch of chunk(matchedUsers, REMINDER_CONCURRENCY)) {
    await Promise.all(batch.map(processUser));
  }
}

import { NovuClient, ReminderContextDto } from '@ai-agentic-english/shared';
import { MemoryProgressClient } from '../lib/memoryProgressClient';
import { AppPrismaClient } from '../lib/prisma';
import { UserServiceClient } from '../lib/userServiceClient';
import { formatTimeInZone, getLocalDateKey } from './time';

export type ReminderHandler = (
  userId: string,
  context: ReminderContextDto,
  novuClient: NovuClient,
) => Promise<boolean>;

export async function withScheduledReminder(
  reminderType: string,
  now: Date,
  prisma: AppPrismaClient,
  userServiceClient: UserServiceClient,
  memoryProgressClient: MemoryProgressClient,
  novuClient: NovuClient,
  handler: ReminderHandler,
): Promise<void> {
  const users = await userServiceClient.listUsers();

  for (const user of users) {
    const { reminderTime, timezone } = user.settings;
    if (!reminderTime || formatTimeInZone(now, timezone) !== reminderTime) continue;

    const runDate = getLocalDateKey(now, timezone);
    const alreadySent = await prisma.scheduledReminderRun.findUnique({
      where: { userId_reminderType_runDate: { userId: user.clerkUserId, reminderType, runDate } },
    });
    if (alreadySent) continue;

    const context = await memoryProgressClient.getReminderContext(user.clerkUserId);
    const notified = await handler(user.clerkUserId, context, novuClient);

    if (notified) {
      await prisma.scheduledReminderRun.create({
        data: { userId: user.clerkUserId, reminderType, runDate },
      });
    }
  }
}

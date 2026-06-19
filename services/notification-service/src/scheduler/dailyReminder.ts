import { NovuClient } from '@ai-agentic-english/shared';
import { MemoryProgressClient } from '../lib/memoryProgressClient';
import { AppPrismaClient } from '../lib/prisma';
import { UserServiceClient } from '../lib/userServiceClient';
import { formatTimeInZone, getLocalDateKey } from './time';

const REMINDER_TYPE = 'daily-reminder';
const WORKFLOW_ID = 'daily-reminder';

export async function runDailyReminder(
  now: Date,
  prisma: AppPrismaClient,
  userServiceClient: UserServiceClient,
  memoryProgressClient: MemoryProgressClient,
  novuClient: NovuClient,
): Promise<void> {
  const users = await userServiceClient.listUsers();

  for (const user of users) {
    const { reminderTime, timezone } = user.settings;
    if (!reminderTime || formatTimeInZone(now, timezone) !== reminderTime) continue;

    const runDate = getLocalDateKey(now, timezone);
    const alreadySent = await prisma.scheduledReminderRun.findUnique({
      where: { userId_reminderType_runDate: { userId: user.clerkUserId, reminderType: REMINDER_TYPE, runDate } },
    });
    if (alreadySent) continue;

    const context = await memoryProgressClient.getReminderContext(user.clerkUserId);
    await novuClient.triggerNotification({
      workflowId: WORKFLOW_ID,
      subscriberId: user.clerkUserId,
      payload: { dueReviewCount: context.dueReviewCount },
    });

    await prisma.scheduledReminderRun.create({ data: { userId: user.clerkUserId, reminderType: REMINDER_TYPE, runDate } });
  }
}

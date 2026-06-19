import { NovuClient } from '@ai-agentic-english/shared';
import { ReminderContextClient } from '../lib/reminderContextClient';
import { AppPrismaClient } from '../lib/prisma';
import { UserServiceClient } from '../lib/userServiceClient';
import { withScheduledReminder } from './schedulerGuard';

export async function runDailyReminder(
  now: Date,
  prisma: AppPrismaClient,
  userServiceClient: UserServiceClient,
  reminderContextClient: ReminderContextClient,
  novuClient: NovuClient,
): Promise<void> {
  await withScheduledReminder(
    'daily-reminder',
    now, prisma, userServiceClient, reminderContextClient, novuClient,
    async (userId, context, novu) => {
      await novu.triggerNotification({
        workflowId: 'daily-reminder',
        subscriberId: userId,
        payload: { dueReviewCount: context.dueReviewCount },
      });
      return true;
    },
  );
}

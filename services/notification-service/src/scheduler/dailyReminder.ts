import { NovuClient } from '@ai-agentic-english/shared';
import { ReminderContextClient } from '../lib/reminderContextClient';
import { AppPrismaClient } from '../lib/prisma';
import { UserServiceClient } from '../lib/userServiceClient';
import { WebPushSender } from '../lib/webPush';
import { withScheduledReminder } from './schedulerGuard';

export async function runDailyReminder(
  now: Date,
  prisma: AppPrismaClient,
  userServiceClient: UserServiceClient,
  reminderContextClient: ReminderContextClient,
  novuClient: NovuClient,
  webPushSender: WebPushSender,
): Promise<void> {
  await withScheduledReminder(
    'daily-reminder',
    now, prisma, userServiceClient, reminderContextClient, novuClient, webPushSender,
    async (userId, context, novu, webPush) => {
      await novu.triggerNotification({
        workflowId: 'daily-reminder',
        subscriberId: userId,
        payload: { dueReviewCount: context.dueReviewCount },
      });
      await webPush.sendToUser(userId, {
        title: 'Nhắc nhở học tập',
        body: `Bạn có ${context.dueReviewCount} từ vựng đến hạn ôn tập hôm nay.`,
        url: '/main/review-center/due',
      });
      return true;
    },
  );
}

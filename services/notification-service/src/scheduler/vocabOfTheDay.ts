import { NovuClient } from '@ai-agentic-english/shared';
import { ReminderContextClient } from '../lib/reminderContextClient';
import { AppPrismaClient } from '../lib/prisma';
import { UserServiceClient } from '../lib/userServiceClient';
import { WebPushSender } from '../lib/webPush';
import { withScheduledReminder } from './schedulerGuard';

export async function runVocabOfTheDay(
  now: Date,
  prisma: AppPrismaClient,
  userServiceClient: UserServiceClient,
  reminderContextClient: ReminderContextClient,
  novuClient: NovuClient,
  webPushSender: WebPushSender,
): Promise<void> {
  await withScheduledReminder(
    'vocab-of-the-day',
    now, prisma, userServiceClient, reminderContextClient, novuClient, webPushSender,
    async (userId, context, novu, webPush) => {
      if (!context.vocabOfTheDay) return false;
      await novu.triggerNotification({
        workflowId: 'vocab-of-the-day',
        subscriberId: userId,
        payload: { ...context.vocabOfTheDay },
      });
      await webPush.sendToUser(userId, {
        title: 'Từ vựng hôm nay',
        body: `${context.vocabOfTheDay.term} — ${context.vocabOfTheDay.meaning}`,
        url: '/main/review-center',
      });
      return true;
    },
  );
}

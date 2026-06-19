import { NovuClient } from '@ai-agentic-english/shared';
import { ReminderContextClient } from '../lib/reminderContextClient';
import { AppPrismaClient } from '../lib/prisma';
import { UserServiceClient } from '../lib/userServiceClient';
import { withScheduledReminder } from './schedulerGuard';

export async function runVocabOfTheDay(
  now: Date,
  prisma: AppPrismaClient,
  userServiceClient: UserServiceClient,
  reminderContextClient: ReminderContextClient,
  novuClient: NovuClient,
): Promise<void> {
  await withScheduledReminder(
    'vocab-of-the-day',
    now, prisma, userServiceClient, reminderContextClient, novuClient,
    async (userId, context, novu) => {
      if (!context.vocabOfTheDay) return false;
      await novu.triggerNotification({
        workflowId: 'vocab-of-the-day',
        subscriberId: userId,
        payload: { ...context.vocabOfTheDay },
      });
      return true;
    },
  );
}

import { NovuClient, UserDeletedEvent } from '@ai-agentic-english/shared';
import { AppPrismaClient } from '../../lib/prisma';
import { withDedup } from '../dedup';

export async function handleUserDeleted(prisma: AppPrismaClient, novuClient: NovuClient, event: UserDeletedEvent): Promise<void> {
  await withDedup(prisma, event.eventId, async () => {
    await prisma.scheduledReminderRun.deleteMany({ where: { userId: event.userId } });
    await novuClient.deleteSubscriber(event.userId);
  });
}

import { NovuClient, UserUpsertedEvent } from '@ai-agentic-english/shared';
import { AppPrismaClient } from '../../lib/prisma';
import { withDedup } from '../dedup';

export async function handleUserUpserted(prisma: AppPrismaClient, novuClient: NovuClient, event: UserUpsertedEvent): Promise<void> {
  await withDedup(prisma, event.eventId, async () => {
    await novuClient.upsertSubscriber({ subscriberId: event.userId, email: event.email, name: event.name });
  });
}

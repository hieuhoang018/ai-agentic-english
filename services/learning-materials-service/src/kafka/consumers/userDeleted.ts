import { UserDeletedEvent } from '@ai-agentic-english/shared';
import { AppPrismaClient } from '../../lib/prisma';

/**
 * Deletes the user's LearningPath rows on account deletion.
 * deleteMany on a userId with no matching rows is a no-op, so at-least-once
 * Kafka delivery is naturally idempotent here — no dedup log needed.
 */
export async function handleUserDeleted(prisma: AppPrismaClient, event: UserDeletedEvent): Promise<void> {
  await prisma.learningPath.deleteMany({ where: { userId: event.userId } });
}

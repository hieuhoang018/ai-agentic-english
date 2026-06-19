import { LearningPathReadyEvent, NovuClient } from '@ai-agentic-english/shared';
import { AppPrismaClient } from '../../lib/prisma';
import { withDedup } from '../dedup';

const WORKFLOW_ID = 'learning-path-ready';

export async function handleLearningPathReady(
  prisma: AppPrismaClient,
  novuClient: NovuClient,
  event: LearningPathReadyEvent,
): Promise<void> {
  await withDedup(prisma, event.eventId, async () => {
    await novuClient.triggerNotification({
      workflowId: WORKFLOW_ID,
      subscriberId: event.userId,
      payload: { pathId: event.pathId },
    });
  });
}

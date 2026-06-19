import { NovuClient, ReviewDueEvent } from '@ai-agentic-english/shared';
import { AppPrismaClient } from '../../lib/prisma';
import { withDedup } from '../dedup';

const WORKFLOW_ID = 'review-due';

export async function handleReviewDue(prisma: AppPrismaClient, novuClient: NovuClient, event: ReviewDueEvent): Promise<void> {
  await withDedup(prisma, event.eventId, async () => {
    await novuClient.triggerNotification({
      workflowId: WORKFLOW_ID,
      subscriberId: event.userId,
      payload: { dueCount: event.dueCount, itemTypes: event.itemTypes },
    });
  });
}

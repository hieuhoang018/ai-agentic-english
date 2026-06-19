import { AchievementUnlockedEvent, NovuClient } from '@ai-agentic-english/shared';
import { AppPrismaClient } from '../../lib/prisma';
import { withDedup } from '../dedup';

const WORKFLOW_ID = 'achievement-unlocked';

export async function handleAchievementUnlocked(
  prisma: AppPrismaClient,
  novuClient: NovuClient,
  event: AchievementUnlockedEvent,
): Promise<void> {
  await withDedup(prisma, event.eventId, async () => {
    await novuClient.triggerNotification({
      workflowId: WORKFLOW_ID,
      subscriberId: event.userId,
      payload: { achievementType: event.achievementType, metadata: event.metadata },
    });
  });
}

import { AchievementUnlockedEvent, NovuClient } from '@ai-agentic-english/shared';
import { AppPrismaClient } from '../../lib/prisma';
import { WebPushSender } from '../../lib/webPush';
import { withDedup } from '../dedup';

const WORKFLOW_ID = 'achievement-unlocked';

export async function handleAchievementUnlocked(
  prisma: AppPrismaClient,
  novuClient: NovuClient,
  webPushSender: WebPushSender,
  event: AchievementUnlockedEvent,
): Promise<void> {
  await withDedup(prisma, event.eventId, async () => {
    await novuClient.triggerNotification({
      workflowId: WORKFLOW_ID,
      subscriberId: event.userId,
      payload: { achievementType: event.achievementType, metadata: event.metadata },
    });
    await webPushSender.sendToUser(event.userId, {
      title: 'Bạn vừa đạt thành tích mới!',
      body: event.achievementType,
      url: '/main/homepage',
    });
  });
}

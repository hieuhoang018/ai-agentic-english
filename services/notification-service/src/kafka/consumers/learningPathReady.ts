import { LearningPathReadyEvent, NovuClient } from '@ai-agentic-english/shared';
import { AppPrismaClient } from '../../lib/prisma';
import { WebPushSender } from '../../lib/webPush';
import { withDedup } from '../dedup';

const WORKFLOW_ID = 'learning-path-ready';

export async function handleLearningPathReady(
  prisma: AppPrismaClient,
  novuClient: NovuClient,
  webPushSender: WebPushSender,
  event: LearningPathReadyEvent,
): Promise<void> {
  await withDedup(prisma, event.eventId, async () => {
    await novuClient.triggerNotification({
      workflowId: WORKFLOW_ID,
      subscriberId: event.userId,
      payload: { pathId: event.pathId },
    });
    await webPushSender.sendToUser(event.userId, {
      title: 'Lộ trình học đã sẵn sàng',
      body: 'Lộ trình học tập cá nhân hóa của bạn đã được tạo xong.',
      url: '/main/homepage',
    });
  });
}

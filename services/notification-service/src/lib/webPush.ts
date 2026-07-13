import webpush from 'web-push';
import { AppPrismaClient } from './prisma';

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

export interface WebPushSender {
  sendToUser(clerkUserId: string, payload: PushPayload): Promise<void>;
}

/** Records calls in memory instead of hitting real push services. Default runtime implementation until real VAPID keys are wired up. */
export class MockWebPushSender implements WebPushSender {
  readonly sent: { clerkUserId: string; payload: PushPayload }[] = [];

  async sendToUser(clerkUserId: string, payload: PushPayload): Promise<void> {
    this.sent.push({ clerkUserId, payload });
  }
}

function isGoneError(error: unknown): error is { statusCode: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    ((error as { statusCode: unknown }).statusCode === 404 ||
      (error as { statusCode: unknown }).statusCode === 410)
  );
}

export function createLiveWebPushSender(
  prisma: AppPrismaClient,
  vapid: { publicKey: string; privateKey: string; subject: string },
): WebPushSender {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  return {
    async sendToUser(clerkUserId: string, payload: PushPayload): Promise<void> {
      const subscriptions = await prisma.pushSubscription.findMany({ where: { clerkUserId } });

      await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              JSON.stringify(payload),
            );
          } catch (error) {
            if (isGoneError(error)) {
              // Push service says this subscription no longer exists (browser
              // unsubscribed, profile removed, etc.) — clean it up so future
              // sends don't keep retrying a dead endpoint.
              await prisma.pushSubscription
                .delete({ where: { endpoint: subscription.endpoint } })
                .catch(() => {});
            } else {
              console.error('web push send failed', error);
            }
          }
        }),
      );
    },
  };
}

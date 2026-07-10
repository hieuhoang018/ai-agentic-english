import { ValidationError, asyncHandler, requireAuth } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { AppPrismaClient } from '../lib/prisma';

type SubscribeBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function parseSubscribeBody(body: unknown): { endpoint: string; p256dh: string; auth: string } {
  const { endpoint, keys } = (body ?? {}) as SubscribeBody;
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    throw new ValidationError('endpoint is required');
  }
  if (typeof keys?.p256dh !== 'string' || typeof keys.auth !== 'string') {
    throw new ValidationError('keys.p256dh and keys.auth are required');
  }
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

export function createPushSubscriptionsRouter(prisma: AppPrismaClient): Router {
  const router = Router();

  // Body is the browser's real PushSubscription.toJSON() shape — matches
  // what apps/web posts from PushNotificationPrompt.tsx.
  router.post(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
      const clerkUserId = req.auth!.userId;
      const { endpoint, p256dh, auth } = parseSubscribeBody(req.body);

      await prisma.pushSubscription.upsert({
        where: { endpoint },
        create: { endpoint, clerkUserId, p256dh, auth },
        update: { clerkUserId, p256dh, auth },
      });

      res.status(204).send();
    }),
  );

  router.delete(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
      const clerkUserId = req.auth!.userId;
      const { endpoint } = (req.body ?? {}) as { endpoint?: unknown };
      if (typeof endpoint !== 'string' || endpoint.length === 0) {
        throw new ValidationError('endpoint is required');
      }

      // Scoped by clerkUserId too, not just endpoint — a user can't remove
      // someone else's subscription by guessing/replaying an endpoint URL.
      await prisma.pushSubscription.deleteMany({ where: { endpoint, clerkUserId } });

      res.status(204).send();
    }),
  );

  return router;
}

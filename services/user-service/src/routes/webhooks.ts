import { AppError, EventBus, UnauthorizedError, asyncHandler, getEnv } from '@ai-agentic-english/shared';
import express, { Router } from 'express';
import { Webhook } from 'svix';
import { ClerkUserEventData, getFullName, getPrimaryEmail } from '../lib/clerkWebhookEvent';
import { publishUserCreated, publishUserDeleted, publishUserUpdated, publishUserUpserted } from '../events/publishers';
import { AppPrismaClient } from '../lib/prisma';

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserEventData;
}

export function createWebhooksRouter(prisma: AppPrismaClient, eventBus: EventBus): Router {
  const secret = getEnv('CLERK_WEBHOOK_SECRET');
  const wh = new Webhook(secret);
  const router = Router();

  router.post(
    '/clerk',
    express.raw({ type: 'application/json' }),
    asyncHandler(async (req, res) => {
      let event: ClerkWebhookEvent;
      try {
        const svixHeaders: Record<string, string> = {
          'svix-id': Array.isArray(req.headers['svix-id'])
            ? req.headers['svix-id'][0]
            : (req.headers['svix-id'] ?? ''),
          'svix-timestamp': Array.isArray(req.headers['svix-timestamp'])
            ? req.headers['svix-timestamp'][0]
            : (req.headers['svix-timestamp'] ?? ''),
          'svix-signature': Array.isArray(req.headers['svix-signature'])
            ? req.headers['svix-signature'][0]
            : (req.headers['svix-signature'] ?? ''),
        };
        event = wh.verify(req.body, svixHeaders) as ClerkWebhookEvent;
      } catch {
        throw new UnauthorizedError('Invalid webhook signature');
      }

      switch (event.type) {
        case 'user.created':
        case 'user.updated': {
          const clerkUserId = event.data.id;
          const email = getPrimaryEmail(event.data);
          if (!email) {
            throw new AppError('Clerk user missing primary email', 400, 'VALIDATION_ERROR');
          }
          const name = getFullName(event.data);

          const user = await prisma.user.upsert({
            where: { clerkUserId },
            create: {
              clerkUserId,
              email,
              name,
              settings: { create: {} },
            },
            update: { email, name },
          });
          const eventPayload = { userId: user.id, clerkUserId: user.clerkUserId, email: user.email };
          if (event.type === 'user.created') {
            await publishUserCreated(eventBus, eventPayload);
            await publishUserUpserted(eventBus, { clerkUserId: user.clerkUserId, email: user.email, name: user.name ?? undefined, action: 'created' });
          } else {
            await publishUserUpdated(eventBus, eventPayload);
            await publishUserUpserted(eventBus, { clerkUserId: user.clerkUserId, email: user.email, name: user.name ?? undefined, action: 'updated' });
          }
          break;
        }
        case 'user.deleted': {
          await prisma.user.deleteMany({ where: { clerkUserId: event.data.id } });
          await publishUserDeleted(eventBus, { clerkUserId: event.data.id });
          break;
        }
        default:
          break;
      }

      res.status(200).json({ received: true });
    }),
  );

  return router;
}

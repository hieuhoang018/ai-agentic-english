import { AppError, UnauthorizedError } from '@ai-agentic-english/shared';
import express, { Router } from 'express';
import { Webhook } from 'svix';
import { asyncHandler } from '../lib/asyncHandler';
import { getFullName, getPrimaryEmail } from '../lib/clerkWebhookEvent';
import { AppPrismaClient } from '../lib/prisma';

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: { id: string; email_address: string }[];
    primary_email_address_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };
}

export function createWebhooksRouter(prisma: AppPrismaClient): Router {
  const router = Router();

  router.post(
    '/clerk',
    express.raw({ type: 'application/json' }),
    asyncHandler(async (req, res) => {
      const secret = process.env.CLERK_WEBHOOK_SECRET;
      if (!secret) {
        throw new AppError('CLERK_WEBHOOK_SECRET is not configured', 500, 'CONFIG_ERROR');
      }

      const wh = new Webhook(secret);
      let event: ClerkWebhookEvent;
      try {
        event = wh.verify(req.body, req.headers as Record<string, string>) as ClerkWebhookEvent;
      } catch {
        throw new UnauthorizedError('Invalid webhook signature');
      }

      switch (event.type) {
        case 'user.created':
        case 'user.updated': {
          const clerkUserId = event.data.id;
          const email = getPrimaryEmail(event.data);
          const name = getFullName(event.data);

          await prisma.user.upsert({
            where: { clerkUserId },
            create: {
              clerkUserId,
              email,
              name,
              settings: { create: {} },
            },
            update: { email, name },
          });
          break;
        }
        case 'user.deleted': {
          await prisma.user.deleteMany({ where: { clerkUserId: event.data.id } });
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

import { NotFoundError, requireAuth } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { AppPrismaClient } from '../lib/prisma';
import { toUserDto, toUserSettingsDto } from '../lib/userMapper';
import { validateSettingsUpdate } from '../lib/validateSettingsUpdate';

export function createUsersRouter(prisma: AppPrismaClient): Router {
  const router = Router();

  router.get(
    '/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      const clerkUserId = req.auth!.userId;

      const user = await prisma.user.findUnique({
        where: { clerkUserId },
        include: { settings: true },
      });

      if (!user || !user.settings) {
        throw new NotFoundError('User not found');
      }

      res.json(toUserDto({ ...user, settings: user.settings }));
    }),
  );

  router.patch(
    '/me/settings',
    requireAuth,
    asyncHandler(async (req, res) => {
      const clerkUserId = req.auth!.userId;

      const user = await prisma.user.findUnique({ where: { clerkUserId } });
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const update = validateSettingsUpdate(req.body);
      const settings = await prisma.userSettings.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...update },
        update,
      });

      res.json(toUserSettingsDto(settings));
    }),
  );

  return router;
}

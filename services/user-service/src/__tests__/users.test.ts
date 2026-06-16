import { TEST_WEBHOOK_SECRET, signTestToken } from '@ai-agentic-english/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createMockPrisma, MockPrismaClient } from './testPrisma';

process.env.CLERK_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

const now = new Date('2024-01-01T00:00:00.000Z');

const userRow = {
  id: 'user-uuid-1',
  clerkUserId: 'user_123',
  email: 'test@example.com',
  name: 'Jane Doe',
  createdAt: now,
  updatedAt: now,
};

const settingsRow = {
  userId: 'user-uuid-1',
  dailyTimeBudgetMinutes: 20,
  preferredLanguage: 'en',
  reminderTime: null,
  timezone: 'UTC',
  notificationChannelHints: {},
};

describe('user routes', () => {
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  describe('GET /users/me', () => {
    it('returns 401 without a token', async () => {
      const app = createApp(prisma);

      const res = await request(app).get('/users/me');

      expect(res.status).toBe(401);
    });

    it('returns the synced user when found', async () => {
      const app = createApp(prisma);
      const token = await signTestToken({ sub: 'user_123' });
      prisma.user.findUnique.mockResolvedValue({ ...userRow, settings: settingsRow });

      const res = await request(app).get('/users/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: 'user-uuid-1',
        clerkUserId: 'user_123',
        email: 'test@example.com',
        name: 'Jane Doe',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        settings: {
          dailyTimeBudgetMinutes: 20,
          preferredLanguage: 'en',
          reminderTime: null,
          timezone: 'UTC',
          notificationChannelHints: {},
        },
      });
    });

    it('returns 404 when the user is not found', async () => {
      const app = createApp(prisma);
      const token = await signTestToken({ sub: 'user_unknown' });
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app).get('/users/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /users/me/settings', () => {
    it('returns 401 without a token', async () => {
      const app = createApp(prisma);

      const res = await request(app).patch('/users/me/settings').send({ timezone: 'Europe/Paris' });

      expect(res.status).toBe(401);
    });

    it('updates settings on a valid request', async () => {
      const app = createApp(prisma);
      const token = await signTestToken({ sub: 'user_123' });
      prisma.user.findUnique.mockResolvedValue(userRow);
      prisma.userSettings.upsert.mockResolvedValue({ ...settingsRow, timezone: 'Europe/Paris' });

      const res = await request(app)
        .patch('/users/me/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ timezone: 'Europe/Paris' });

      expect(res.status).toBe(200);
      expect(res.body.timezone).toBe('Europe/Paris');
      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1' },
        create: { userId: 'user-uuid-1', timezone: 'Europe/Paris' },
        update: { timezone: 'Europe/Paris' },
      });
    });

    it('returns 400 for an invalid update', async () => {
      const app = createApp(prisma);
      const token = await signTestToken({ sub: 'user_123' });
      prisma.user.findUnique.mockResolvedValue(userRow);

      const res = await request(app)
        .patch('/users/me/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ dailyTimeBudgetMinutes: -5 });

      expect(res.status).toBe(400);
    });

    it('returns 404 when the user is not found', async () => {
      const app = createApp(prisma);
      const token = await signTestToken({ sub: 'user_unknown' });
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .patch('/users/me/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ timezone: 'Europe/Paris' });

      expect(res.status).toBe(404);
    });
  });
});

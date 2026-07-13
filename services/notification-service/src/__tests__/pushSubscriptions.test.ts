import { signTestToken } from '@ai-agentic-english/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createMockPrisma, MockPrismaClient } from './testPrisma';

describe('push-subscriptions routes', () => {
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  describe('POST /push-subscriptions', () => {
    it('returns 401 without a token', async () => {
      const app = createApp(prisma);

      const res = await request(app)
        .post('/push-subscriptions')
        .send({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } });

      expect(res.status).toBe(401);
    });

    it('upserts the subscription for the authenticated user', async () => {
      const app = createApp(prisma);
      const token = await signTestToken({ sub: 'user_123' });

      const res = await request(app)
        .post('/push-subscriptions')
        .set('Authorization', `Bearer ${token}`)
        .send({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p-key', auth: 'a-key' } });

      expect(res.status).toBe(204);
      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com/abc' },
        create: { endpoint: 'https://push.example.com/abc', clerkUserId: 'user_123', p256dh: 'p-key', auth: 'a-key' },
        update: { clerkUserId: 'user_123', p256dh: 'p-key', auth: 'a-key' },
      });
    });

    it('returns 400 when keys are missing', async () => {
      const app = createApp(prisma);
      const token = await signTestToken({ sub: 'user_123' });

      const res = await request(app)
        .post('/push-subscriptions')
        .set('Authorization', `Bearer ${token}`)
        .send({ endpoint: 'https://push.example.com/abc' });

      expect(res.status).toBe(400);
      expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /push-subscriptions', () => {
    it('returns 401 without a token', async () => {
      const app = createApp(prisma);

      const res = await request(app).delete('/push-subscriptions').send({ endpoint: 'https://push.example.com/abc' });

      expect(res.status).toBe(401);
    });

    it('deletes the subscription scoped to the authenticated user', async () => {
      const app = createApp(prisma);
      const token = await signTestToken({ sub: 'user_123' });

      const res = await request(app)
        .delete('/push-subscriptions')
        .set('Authorization', `Bearer ${token}`)
        .send({ endpoint: 'https://push.example.com/abc' });

      expect(res.status).toBe(204);
      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com/abc', clerkUserId: 'user_123' },
      });
    });

    it('returns 400 when endpoint is missing', async () => {
      const app = createApp(prisma);
      const token = await signTestToken({ sub: 'user_123' });

      const res = await request(app).delete('/push-subscriptions').set('Authorization', `Bearer ${token}`).send({});

      expect(res.status).toBe(400);
      expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
    });
  });
});

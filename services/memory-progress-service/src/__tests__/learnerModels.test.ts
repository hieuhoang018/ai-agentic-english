import { signTestToken } from '@ai-agentic-english/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { MockPrismaClient, createMockPrisma } from './testPrisma';

const now = new Date('2024-01-01T00:00:00.000Z');

const learnerModelRow = {
  userId: 'user_123',
  currentLevel: { reading: 'A2', listening: 'A1' },
  dailyTimeBudgetMinutes: 20,
  goals: ['job-interview', 'emails'],
  weakAreas: ['grammar'],
  createdAt: now,
  updatedAt: now,
};

describe('learner model routes', () => {
  let prisma: MockPrismaClient;
  let token: string;

  beforeEach(async () => {
    prisma = createMockPrisma();
    token = await signTestToken({ sub: 'user_123' });
  });

  describe('GET /learner-models/:userId', () => {
    it('returns 401 without a token', async () => {
      const res = await request(createApp(prisma)).get('/learner-models/user_123');
      expect(res.status).toBe(401);
    });

    it('returns the learner model', async () => {
      prisma.learnerModel.findUnique.mockResolvedValue(learnerModelRow);

      const res = await request(createApp(prisma))
        .get('/learner-models/user_123')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('user_123');
      expect(res.body.currentLevel).toEqual({ reading: 'A2', listening: 'A1' });
      expect(res.body.dailyTimeBudgetMinutes).toBe(20);
    });

    it('returns 404 when no learner model exists', async () => {
      prisma.learnerModel.findUnique.mockResolvedValue(null);

      const res = await request(createApp(prisma))
        .get('/learner-models/user_123')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /learner-models/:userId', () => {
    it('returns 401 without a token', async () => {
      const res = await request(createApp(prisma)).patch('/learner-models/user_123').send({});
      expect(res.status).toBe(401);
    });

    it('returns 404 when no learner model exists', async () => {
      prisma.learnerModel.findUnique.mockResolvedValue(null);

      const res = await request(createApp(prisma))
        .patch('/learner-models/user_123')
        .set('Authorization', `Bearer ${token}`)
        .send({ dailyTimeBudgetMinutes: 30 });

      expect(res.status).toBe(404);
    });

    it('returns 400 for a non-positive dailyTimeBudgetMinutes', async () => {
      prisma.learnerModel.findUnique.mockResolvedValue(learnerModelRow);

      const res = await request(createApp(prisma))
        .patch('/learner-models/user_123')
        .set('Authorization', `Bearer ${token}`)
        .send({ dailyTimeBudgetMinutes: 0 });

      expect(res.status).toBe(400);
    });

    it('updates only the provided fields', async () => {
      prisma.learnerModel.findUnique.mockResolvedValue(learnerModelRow);
      prisma.learnerModel.update.mockResolvedValue({
        ...learnerModelRow,
        dailyTimeBudgetMinutes: 30,
      });

      const res = await request(createApp(prisma))
        .patch('/learner-models/user_123')
        .set('Authorization', `Bearer ${token}`)
        .send({ dailyTimeBudgetMinutes: 30 });

      expect(res.status).toBe(200);
      expect(res.body.dailyTimeBudgetMinutes).toBe(30);
      expect(prisma.learnerModel.update).toHaveBeenCalledWith({
        where: { userId: 'user_123' },
        data: { dailyTimeBudgetMinutes: 30 },
      });
    });
  });
});

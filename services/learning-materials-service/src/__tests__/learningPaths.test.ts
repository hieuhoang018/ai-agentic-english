import { signTestToken } from '@ai-agentic-english/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { MockPrismaClient, createMockPrisma } from './testPrisma';

const now = new Date('2024-01-01T00:00:00.000Z');

const activePath = {
  id: 'path-1',
  userId: 'user_123',
  version: 1,
  status: 'active',
  generatedAt: now,
  pathDefinition: {
    modules: [{ moduleId: 'mod-1', lessons: [{ lessonId: 'les-1', exerciseIds: ['ex-1'] }] }],
  },
};

describe('learning path routes', () => {
  let prisma: MockPrismaClient;
  let token: string;

  beforeEach(async () => {
    prisma = createMockPrisma();
    token = await signTestToken({ sub: 'user_123' });
  });

  describe('GET /learning-paths/:userId/active', () => {
    it('returns 401 without a token', async () => {
      const res = await request(createApp(prisma)).get('/learning-paths/user_123/active');
      expect(res.status).toBe(401);
    });

    it('returns the active learning path', async () => {
      prisma.learningPath.findFirst.mockResolvedValue(activePath);

      const res = await request(createApp(prisma))
        .get('/learning-paths/user_123/active')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('path-1');
      expect(res.body.status).toBe('active');
      expect(res.body.userId).toBe('user_123');
    });

    it('returns 404 when no active path exists', async () => {
      prisma.learningPath.findFirst.mockResolvedValue(null);

      const res = await request(createApp(prisma))
        .get('/learning-paths/user_123/active')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});

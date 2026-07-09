import { signTestToken } from '@ai-agentic-english/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { MockPrismaClient, createMockPrisma } from './testPrisma';

const now = new Date('2024-01-01T00:00:00.000Z');

const moduleRow = {
  id: 'mod-1',
  title: 'Reading Fundamentals',
  description: 'Core reading skills.',
  cefrLevel: 'A2',
  skillFocus: 'reading',
  order: 1,
  createdAt: now,
  updatedAt: now,
};

const lessonRow = {
  id: 'les-1',
  moduleId: 'mod-1',
  title: 'Reading Short Texts',
  content: { introduction: 'Practice.' },
  order: 1,
  createdAt: now,
  updatedAt: now,
};

const exerciseRow = {
  id: 'ex-1',
  lessonId: 'les-1',
  type: 'mcq',
  prompt: { question: 'What colour is the apple?', options: ['Red', 'Blue'] },
  answerKey: { answer: 'Red' },
  difficulty: 'easy',
  skill: 'reading',
  createdAt: now,
  updatedAt: now,
};

describe('catalog routes', () => {
  let prisma: MockPrismaClient;
  let token: string;

  beforeEach(async () => {
    prisma = createMockPrisma();
    token = await signTestToken({ sub: 'user_123' });
  });

  describe('GET /modules', () => {
    it('returns 401 without a token', async () => {
      const res = await request(createApp(prisma)).get('/modules');
      expect(res.status).toBe(401);
    });

    it('returns a list of modules', async () => {
      prisma.module.findMany.mockResolvedValue([moduleRow]);

      const res = await request(createApp(prisma))
        .get('/modules')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          id: 'mod-1',
          title: 'Reading Fundamentals',
          description: 'Core reading skills.',
          cefrLevel: 'A2',
          skillFocus: 'reading',
          order: 1,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ]);
    });
  });

  describe('GET /modules/:id', () => {
    it('returns 404 when module not found', async () => {
      prisma.module.findUnique.mockResolvedValue(null);

      const res = await request(createApp(prisma))
        .get('/modules/missing')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns the module', async () => {
      prisma.module.findUnique.mockResolvedValue(moduleRow);

      const res = await request(createApp(prisma))
        .get('/modules/mod-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('mod-1');
    });
  });

  describe('GET /modules/:id/lessons', () => {
    it('returns 404 when module not found', async () => {
      prisma.module.findUnique.mockResolvedValue(null);

      const res = await request(createApp(prisma))
        .get('/modules/missing/lessons')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns lessons for the module', async () => {
      prisma.module.findUnique.mockResolvedValue({ ...moduleRow, lessons: [lessonRow] });

      const res = await request(createApp(prisma))
        .get('/modules/mod-1/lessons')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('les-1');
    });
  });

  describe('GET /lessons/:id', () => {
    it('returns 404 when lesson not found', async () => {
      prisma.lesson.findUnique.mockResolvedValue(null);

      const res = await request(createApp(prisma))
        .get('/lessons/missing')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns the lesson', async () => {
      prisma.lesson.findUnique.mockResolvedValue(lessonRow);

      const res = await request(createApp(prisma))
        .get('/lessons/les-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('les-1');
    });
  });

  describe('GET /lessons/:id/exercises', () => {
    it('returns 404 when lesson not found', async () => {
      prisma.lesson.findUnique.mockResolvedValue(null);

      const res = await request(createApp(prisma))
        .get('/lessons/missing/exercises')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns exercises for the lesson without answer keys', async () => {
      prisma.lesson.findUnique.mockResolvedValue({ ...lessonRow, exercises: [exerciseRow] });

      const res = await request(createApp(prisma))
        .get('/lessons/les-1/exercises')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ id: 'ex-1', lessonId: 'les-1' });
      expect(res.body[0]).not.toHaveProperty('answerKey');
    });
  });

  describe('GET /exercises/:id', () => {
    it('returns exercise without answerKey', async () => {
      prisma.exercise.findUnique.mockResolvedValue(exerciseRow);

      const res = await request(createApp(prisma))
        .get('/exercises/ex-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('ex-1');
      expect(res.body).not.toHaveProperty('answerKey');
    });

    it('returns 404 when exercise not found', async () => {
      prisma.exercise.findUnique.mockResolvedValue(null);

      const res = await request(createApp(prisma))
        .get('/exercises/missing')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});

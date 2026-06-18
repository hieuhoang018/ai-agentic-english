import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { MockPrismaClient, createMockPrisma } from './testPrisma';

const INTERNAL_SECRET = 'dev-internal-secret';
const INTERNAL_HEADER = 'x-internal-secret';

const now = new Date('2024-01-01T00:00:00.000Z');

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

const pathDefinition = {
  modules: [{ moduleId: 'mod-1', lessons: [{ lessonId: 'les-1', exerciseIds: ['ex-1'] }] }],
};

const existingActivePath = {
  id: 'path-1',
  userId: 'user_123',
  version: 1,
  status: 'active',
  generatedAt: now,
  pathDefinition,
};

describe('internal routes', () => {
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  describe('auth guard', () => {
    it('returns 403 without internal secret header', async () => {
      const res = await request(createApp(prisma)).get('/internal/exercises/ex-1');
      expect(res.status).toBe(403);
    });

    it('returns 403 with wrong secret', async () => {
      const res = await request(createApp(prisma))
        .get('/internal/exercises/ex-1')
        .set(INTERNAL_HEADER, 'wrong-secret');
      expect(res.status).toBe(403);
    });
  });

  describe('GET /internal/exercises/:id', () => {
    it('returns exercise with answerKey', async () => {
      prisma.exercise.findUnique.mockResolvedValue(exerciseRow);

      const res = await request(createApp(prisma))
        .get('/internal/exercises/ex-1')
        .set(INTERNAL_HEADER, INTERNAL_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('ex-1');
      expect(res.body.answerKey).toEqual({ answer: 'Red' });
    });

    it('returns 404 when exercise not found', async () => {
      prisma.exercise.findUnique.mockResolvedValue(null);

      const res = await request(createApp(prisma))
        .get('/internal/exercises/missing')
        .set(INTERNAL_HEADER, INTERNAL_SECRET);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /internal/learning-paths/:id', () => {
    it('returns the path by id', async () => {
      prisma.learningPath.findUnique.mockResolvedValue(existingActivePath);

      const res = await request(createApp(prisma))
        .get('/internal/learning-paths/path-1')
        .set(INTERNAL_HEADER, INTERNAL_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('path-1');
      expect(res.body.pathDefinition).toEqual(pathDefinition);
    });

    it('returns 404 when path not found', async () => {
      prisma.learningPath.findUnique.mockResolvedValue(null);

      const res = await request(createApp(prisma))
        .get('/internal/learning-paths/missing')
        .set(INTERNAL_HEADER, INTERNAL_SECRET);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /internal/learning-paths', () => {
    it('returns 400 without userId', async () => {
      const res = await request(createApp(prisma))
        .post('/internal/learning-paths')
        .set(INTERNAL_HEADER, INTERNAL_SECRET)
        .send({ pathDefinition });

      expect(res.status).toBe(400);
    });

    it('creates a new path when no active path exists (version 1)', async () => {
      prisma.learningPath.findFirst.mockResolvedValue(null);
      prisma.learningPath.create.mockResolvedValue({
        id: 'path-new',
        userId: 'user_123',
        version: 1,
        status: 'active',
        generatedAt: now,
        pathDefinition,
      });

      const res = await request(createApp(prisma))
        .post('/internal/learning-paths')
        .set(INTERNAL_HEADER, INTERNAL_SECRET)
        .send({ userId: 'user_123', pathDefinition });

      expect(res.status).toBe(201);
      expect(res.body.version).toBe(1);
      expect(res.body.status).toBe('active');
      expect(prisma.learningPath.update).not.toHaveBeenCalled();
    });

    it('supersedes the existing active path and creates version 2', async () => {
      prisma.learningPath.findFirst.mockResolvedValue(existingActivePath);
      prisma.learningPath.update.mockResolvedValue({ ...existingActivePath, status: 'superseded' });
      prisma.learningPath.create.mockResolvedValue({
        id: 'path-2',
        userId: 'user_123',
        version: 2,
        status: 'active',
        generatedAt: now,
        pathDefinition,
      });

      const res = await request(createApp(prisma))
        .post('/internal/learning-paths')
        .set(INTERNAL_HEADER, INTERNAL_SECRET)
        .send({ userId: 'user_123', pathDefinition });

      expect(res.status).toBe(201);
      expect(res.body.version).toBe(2);
      expect(prisma.learningPath.update).toHaveBeenCalledWith({
        where: { id: 'path-1' },
        data: { status: 'superseded' },
      });
    });

    it('immutability — existing path is superseded not mutated', async () => {
      prisma.learningPath.findFirst.mockResolvedValue(existingActivePath);
      prisma.learningPath.update.mockResolvedValue({ ...existingActivePath, status: 'superseded' });
      prisma.learningPath.create.mockResolvedValue({
        id: 'path-2',
        userId: 'user_123',
        version: 2,
        status: 'active',
        generatedAt: now,
        pathDefinition,
      });

      await request(createApp(prisma))
        .post('/internal/learning-paths')
        .set(INTERNAL_HEADER, INTERNAL_SECRET)
        .send({ userId: 'user_123', pathDefinition });

      // update must set status to superseded, not modify pathDefinition
      expect(prisma.learningPath.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'superseded' } }),
      );
      // create must produce a brand new record
      expect(prisma.learningPath.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 2, status: 'active' }) }),
      );
    });
  });
});

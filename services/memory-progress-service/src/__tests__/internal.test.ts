import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { MockPrismaClient, createMockPrisma } from './testPrisma';

const INTERNAL_SECRET = 'dev-internal-secret';
const INTERNAL_HEADER = 'x-internal-secret';

const now = new Date('2024-01-01T00:00:00.000Z');

const validPayload = {
  userId: 'user_123',
  currentLevel: { reading: 'A1' },
  dailyTimeBudgetMinutes: 15,
  goals: ['job-interview'],
};

describe('internal routes', () => {
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  describe('auth guard', () => {
    it('returns 403 without internal secret header', async () => {
      const res = await request(createApp(prisma)).post('/internal/learner-models').send(validPayload);
      expect(res.status).toBe(403);
    });

    it('returns 403 with wrong secret', async () => {
      const res = await request(createApp(prisma))
        .post('/internal/learner-models')
        .set(INTERNAL_HEADER, 'wrong-secret')
        .send(validPayload);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /internal/learner-models', () => {
    it('returns 400 without userId', async () => {
      const res = await request(createApp(prisma))
        .post('/internal/learner-models')
        .set(INTERNAL_HEADER, INTERNAL_SECRET)
        .send({ currentLevel: validPayload.currentLevel, dailyTimeBudgetMinutes: validPayload.dailyTimeBudgetMinutes, goals: validPayload.goals });

      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-positive dailyTimeBudgetMinutes', async () => {
      const res = await request(createApp(prisma))
        .post('/internal/learner-models')
        .set(INTERNAL_HEADER, INTERNAL_SECRET)
        .send({ ...validPayload, dailyTimeBudgetMinutes: 0 });

      expect(res.status).toBe(400);
    });

    it('creates the learner model with default empty weakAreas', async () => {
      prisma.learnerModel.upsert.mockResolvedValue({
        ...validPayload,
        weakAreas: [],
        createdAt: now,
        updatedAt: now,
      });

      const res = await request(createApp(prisma))
        .post('/internal/learner-models')
        .set(INTERNAL_HEADER, INTERNAL_SECRET)
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.userId).toBe('user_123');
      expect(res.body.weakAreas).toEqual([]);
      expect(prisma.learnerModel.upsert).toHaveBeenCalledWith({
        where: { userId: 'user_123' },
        create: expect.objectContaining({ userId: 'user_123', weakAreas: [] }),
        update: expect.objectContaining({ weakAreas: [] }),
      });
    });

    it('is idempotent — re-onboarding upserts rather than erroring', async () => {
      prisma.learnerModel.upsert.mockResolvedValue({
        ...validPayload,
        weakAreas: ['grammar'],
        createdAt: now,
        updatedAt: now,
      });

      const res = await request(createApp(prisma))
        .post('/internal/learner-models')
        .set(INTERNAL_HEADER, INTERNAL_SECRET)
        .send({ ...validPayload, weakAreas: ['grammar'] });

      expect(res.status).toBe(201);
      expect(res.body.weakAreas).toEqual(['grammar']);
    });
  });

  describe('POST /internal/progress/:userId/initialize', () => {
    it('returns 403 without internal secret header', async () => {
      const res = await request(createApp(prisma))
        .post('/internal/progress/user_123/initialize')
        .send({ pathId: 'path-1' });
      expect(res.status).toBe(403);
    });

    it('returns 400 without pathId', async () => {
      const res = await request(createApp(prisma))
        .post('/internal/progress/user_123/initialize')
        .set(INTERNAL_HEADER, INTERNAL_SECRET)
        .send({});

      expect(res.status).toBe(400);
    });

    it('initializes progress at the path start', async () => {
      prisma.progress.upsert.mockResolvedValue({
        userId: 'user_123',
        pathId: 'path-1',
        currentModuleId: 'mod-1',
        currentLessonId: 'les-1',
        currentExerciseId: 'ex-1',
        completedExerciseIds: [],
        createdAt: now,
        updatedAt: now,
      });

      const res = await request(createApp(prisma))
        .post('/internal/progress/user_123/initialize')
        .set(INTERNAL_HEADER, INTERNAL_SECRET)
        .send({ pathId: 'path-1', currentModuleId: 'mod-1', currentLessonId: 'les-1', currentExerciseId: 'ex-1' });

      expect(res.status).toBe(201);
      expect(res.body.pathId).toBe('path-1');
      expect(res.body.completedExerciseIds).toEqual([]);
      expect(prisma.progress.upsert).toHaveBeenCalledWith({
        where: { userId: 'user_123' },
        create: expect.objectContaining({
          userId: 'user_123',
          pathId: 'path-1',
          currentModuleId: 'mod-1',
          completedExerciseIds: [],
        }),
        update: expect.objectContaining({ pathId: 'path-1', completedExerciseIds: [] }),
      });
    });

    it('resets completedExerciseIds when re-initializing onto a new path', async () => {
      prisma.progress.upsert.mockResolvedValue({
        userId: 'user_123',
        pathId: 'path-2',
        currentModuleId: 'mod-1',
        currentLessonId: 'les-1',
        currentExerciseId: 'ex-1',
        completedExerciseIds: [],
        createdAt: now,
        updatedAt: now,
      });

      const res = await request(createApp(prisma))
        .post('/internal/progress/user_123/initialize')
        .set(INTERNAL_HEADER, INTERNAL_SECRET)
        .send({ pathId: 'path-2' });

      expect(res.status).toBe(201);
      expect(res.body.completedExerciseIds).toEqual([]);
      expect(res.body.currentModuleId).toBe('mod-1');
    });
  });

  describe('GET /internal/reminders/:userId/context', () => {
    it('returns 403 without internal secret header', async () => {
      const res = await request(createApp(prisma)).get('/internal/reminders/user_123/context');
      expect(res.status).toBe(403);
    });

    it('returns due review count and null vocabOfTheDay when there is no due vocab', async () => {
      prisma.reviewSchedule.count.mockResolvedValue(3);
      prisma.reviewSchedule.findFirst.mockResolvedValue(null);

      const res = await request(createApp(prisma))
        .get('/internal/reminders/user_123/context')
        .set(INTERNAL_HEADER, INTERNAL_SECRET);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ userId: 'user_123', dueReviewCount: 3, vocabOfTheDay: null });
    });

    it('returns the earliest-due vocab item as vocabOfTheDay', async () => {
      prisma.reviewSchedule.count.mockResolvedValue(1);
      prisma.reviewSchedule.findFirst.mockResolvedValue({ itemId: 'vocab-1', itemType: 'vocab' });
      prisma.vocabItem.findUnique.mockResolvedValue({
        id: 'vocab-1',
        term: 'ubiquitous',
        meaning: 'present everywhere',
        exampleSentence: 'Smartphones are ubiquitous nowadays.',
      });

      const res = await request(createApp(prisma))
        .get('/internal/reminders/user_123/context')
        .set(INTERNAL_HEADER, INTERNAL_SECRET);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        userId: 'user_123',
        dueReviewCount: 1,
        vocabOfTheDay: {
          vocabItemId: 'vocab-1',
          term: 'ubiquitous',
          meaning: 'present everywhere',
          exampleSentence: 'Smartphones are ubiquitous nowadays.',
        },
      });
    });
  });
});

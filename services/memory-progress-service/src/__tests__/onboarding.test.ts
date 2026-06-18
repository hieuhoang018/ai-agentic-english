import { LearningPathDto, signTestToken } from '@ai-agentic-english/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { AiTutorClient } from '../lib/aiTutorClient';
import { MockPrismaClient, createMockPrisma } from './testPrisma';

const now = new Date('2024-01-10T00:00:00.000Z');

const learningPath: LearningPathDto = {
  id: 'path-1',
  userId: 'user_123',
  version: 1,
  status: 'active',
  generatedAt: now.toISOString(),
  pathDefinition: { modules: [{ moduleId: 'mod-1', lessons: [{ lessonId: 'les-1', exerciseIds: ['ex-1'] }] }] },
};

const validBody = {
  currentLevel: { reading: 'A1' },
  dailyTimeBudgetMinutes: 15,
  goals: ['job-interview'],
};

describe('POST /onboarding', () => {
  let prisma: MockPrismaClient;
  let aiTutor: AiTutorClient;
  let token: string;

  beforeEach(async () => {
    prisma = createMockPrisma();
    prisma.learnerModel.upsert.mockResolvedValue({
      userId: 'user_123',
      currentLevel: validBody.currentLevel,
      dailyTimeBudgetMinutes: validBody.dailyTimeBudgetMinutes,
      goals: validBody.goals,
      weakAreas: [],
      createdAt: now,
      updatedAt: now,
    });
    aiTutor = { generatePath: vi.fn().mockResolvedValue(learningPath) };
    token = await signTestToken({ sub: 'user_123' });
  });

  it('returns 401 without a token', async () => {
    const res = await request(createApp(prisma, undefined, undefined, aiTutor)).post('/onboarding').send(validBody);
    expect(res.status).toBe(401);
  });

  it('upserts the learner model and returns the generated path', async () => {
    const res = await request(createApp(prisma, undefined, undefined, aiTutor))
      .post('/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(learningPath);
    expect(prisma.learnerModel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_123' } }),
    );
    expect(aiTutor.generatePath).toHaveBeenCalledWith({
      userId: 'user_123',
      currentLevel: validBody.currentLevel,
      dailyTimeBudgetMinutes: validBody.dailyTimeBudgetMinutes,
      goals: validBody.goals,
    });
  });

  it('returns 400 when dailyTimeBudgetMinutes is invalid', async () => {
    const res = await request(createApp(prisma, undefined, undefined, aiTutor))
      .post('/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validBody, dailyTimeBudgetMinutes: -1 });

    expect(res.status).toBe(400);
    expect(aiTutor.generatePath).not.toHaveBeenCalled();
  });
});

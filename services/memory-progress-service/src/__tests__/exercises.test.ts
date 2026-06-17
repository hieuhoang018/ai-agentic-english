import { ExerciseInternalDto, signTestToken } from '@ai-agentic-english/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { LearningMaterialsClient } from '../lib/learningMaterialsClient';
import { MockPrismaClient, createMockPrisma } from './testPrisma';

const now = new Date('2024-01-10T00:00:00.000Z');

const exerciseInternal: ExerciseInternalDto = {
  id: 'ex-1',
  lessonId: 'les-1',
  type: 'mcq',
  prompt: { question: 'What colour is the apple?', options: ['Red', 'Blue'] },
  answerKey: { answer: 'Red' },
  difficulty: 'easy',
  skill: 'reading',
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};

describe('GET /exercises/next', () => {
  let prisma: MockPrismaClient;
  let learningMaterials: LearningMaterialsClient;
  let token: string;

  beforeEach(async () => {
    prisma = createMockPrisma();
    learningMaterials = { getExercise: vi.fn().mockResolvedValue(exerciseInternal) };
    token = await signTestToken({ sub: 'user_123' });
  });

  it('returns 401 without a token', async () => {
    const res = await request(createApp(prisma, learningMaterials)).get('/exercises/next');
    expect(res.status).toBe(401);
  });

  it('serves a due review item before path progression', async () => {
    prisma.reviewSchedule.findFirst.mockResolvedValue({
      id: 'rs-1',
      userId: 'user_123',
      itemId: 'ex-1',
      itemType: 'exercise',
      due: now,
    });

    const res = await request(createApp(prisma, learningMaterials))
      .get('/exercises/next')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('review');
    expect(res.body.reviewScheduleId).toBe('rs-1');
    expect(res.body.exercise.id).toBe('ex-1');
    expect(res.body.exercise).not.toHaveProperty('answerKey');
    expect(learningMaterials.getExercise).toHaveBeenCalledWith('ex-1');
    expect(prisma.progress.findUnique).not.toHaveBeenCalled();
  });

  it('queries due reviews for this user only, ordered earliest-due first', async () => {
    prisma.reviewSchedule.findFirst.mockResolvedValue(null);
    prisma.progress.findUnique.mockResolvedValue({ userId: 'user_123', currentExerciseId: 'ex-1' });

    await request(createApp(prisma, learningMaterials)).get('/exercises/next').set('Authorization', `Bearer ${token}`);

    expect(prisma.reviewSchedule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user_123', itemType: 'exercise' }),
        orderBy: { due: 'asc' },
      }),
    );
  });

  it('falls back to path progression when no review is due', async () => {
    prisma.reviewSchedule.findFirst.mockResolvedValue(null);
    prisma.progress.findUnique.mockResolvedValue({ userId: 'user_123', currentExerciseId: 'ex-1' });

    const res = await request(createApp(prisma, learningMaterials))
      .get('/exercises/next')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('path');
    expect(res.body.reviewScheduleId).toBeUndefined();
    expect(res.body.exercise.id).toBe('ex-1');
  });

  it('returns 404 when no review is due and progress has no current exercise', async () => {
    prisma.reviewSchedule.findFirst.mockResolvedValue(null);
    prisma.progress.findUnique.mockResolvedValue(null);

    const res = await request(createApp(prisma, learningMaterials))
      .get('/exercises/next')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

import { signTestToken } from '@ai-agentic-english/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { HighlightContentGenerator } from '../lib/highlightContentGenerator';
import { MockPrismaClient, createMockPrisma } from './testPrisma';

const now = new Date('2024-01-10T00:00:00.000Z');

const fakeContentGenerator: HighlightContentGenerator = {
  generateMistakeExplanation: vi.fn().mockResolvedValue({ explanation: 'exp', example: 'ex' }),
  generateVocabExample: vi.fn().mockResolvedValue({ explanation: 'vexp', example: 'vex' }),
};

describe('GET /review-center/highlights', () => {
  let prisma: MockPrismaClient;
  let token: string;

  beforeEach(async () => {
    prisma = createMockPrisma();
    prisma.mistake.groupBy.mockResolvedValue([]);
    prisma.reviewSchedule.findMany.mockResolvedValue([]);
    prisma.vocabItem.findMany.mockResolvedValue([]);
    token = await signTestToken({ sub: 'user_123' });
  });

  it('returns 401 without a token', async () => {
    const res = await request(createApp(prisma, undefined, fakeContentGenerator)).get('/review-center/highlights');
    expect(res.status).toBe(401);
  });

  it('returns empty lists when there is nothing to highlight', async () => {
    const res = await request(createApp(prisma, undefined, fakeContentGenerator))
      .get('/review-center/highlights')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mistakes: [], vocab: [] });
  });

  it('selects top mistakes by frequency and attaches generated content', async () => {
    prisma.mistake.groupBy.mockResolvedValue([
      { errorCategory: 'grammar', errorLabel: 'subject-verb-agreement', _count: { _all: 4 }, _max: { createdAt: now } },
    ]);

    const res = await request(createApp(prisma, undefined, fakeContentGenerator))
      .get('/review-center/highlights')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.mistakes).toEqual([
      {
        errorCategory: 'grammar',
        errorLabel: 'subject-verb-agreement',
        occurrences: 4,
        lastOccurredAt: now.toISOString(),
        explanation: 'exp',
        example: 'ex',
      },
    ]);
    expect(prisma.mistake.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_123' }, take: 5 }),
    );
  });

  it('selects due vocab and joins with VocabItem content', async () => {
    prisma.reviewSchedule.findMany.mockResolvedValue([
      { id: 'rs-1', userId: 'user_123', itemId: 'vocab-1', itemType: 'vocab', due: now },
    ]);
    prisma.vocabItem.findMany.mockResolvedValue([
      { id: 'vocab-1', userId: 'user_123', term: 'ubiquitous', meaning: 'present everywhere', exampleSentence: null, sourceExerciseId: null, createdAt: now },
    ]);

    const res = await request(createApp(prisma, undefined, fakeContentGenerator))
      .get('/review-center/highlights')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.vocab).toEqual([
      {
        vocabItemId: 'vocab-1',
        term: 'ubiquitous',
        meaning: 'present everywhere',
        due: now.toISOString(),
        explanation: 'vexp',
        example: 'vex',
      },
    ]);
    expect(prisma.reviewSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_123', itemType: 'vocab', due: { lte: expect.any(Date) } },
        orderBy: { due: 'asc' },
        take: 10,
      }),
    );
  });

  it('drops a due schedule whose VocabItem no longer exists', async () => {
    prisma.reviewSchedule.findMany.mockResolvedValue([
      { id: 'rs-1', userId: 'user_123', itemId: 'vocab-missing', itemType: 'vocab', due: now },
    ]);
    prisma.vocabItem.findMany.mockResolvedValue([]);

    const res = await request(createApp(prisma, undefined, fakeContentGenerator))
      .get('/review-center/highlights')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.vocab).toEqual([]);
  });
});

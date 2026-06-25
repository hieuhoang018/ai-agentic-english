import { signTestToken } from '@ai-agentic-english/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { SCORING_THRESHOLD } from '../scoring/assessmentScorer';
import { MockPrismaClient, createMockPrisma } from './testPrisma';

const now = new Date('2024-01-01T00:00:00.000Z');

const readingA1Questions = [
  { id: 'aq-r-a1-1', skill: 'reading', cefrLevelTarget: 'A1', prompt: { question: 'Q1' }, correctAnswer: { answer: 'A' }, order: 1, createdAt: now },
  { id: 'aq-r-a1-2', skill: 'reading', cefrLevelTarget: 'A1', prompt: { question: 'Q2' }, correctAnswer: { answer: 'B' }, order: 2, createdAt: now },
  { id: 'aq-r-a1-3', skill: 'reading', cefrLevelTarget: 'A1', prompt: { question: 'Q3' }, correctAnswer: { answer: 'C' }, order: 3, createdAt: now },
];

const readingA2Questions = [
  { id: 'aq-r-a2-1', skill: 'reading', cefrLevelTarget: 'A2', prompt: { question: 'Q4' }, correctAnswer: { answer: 'D' }, order: 4, createdAt: now },
  { id: 'aq-r-a2-2', skill: 'reading', cefrLevelTarget: 'A2', prompt: { question: 'Q5' }, correctAnswer: { answer: 'E' }, order: 5, createdAt: now },
  { id: 'aq-r-a2-3', skill: 'reading', cefrLevelTarget: 'A2', prompt: { question: 'Q6' }, correctAnswer: { answer: 'F' }, order: 6, createdAt: now },
];

const readingB1Questions = [
  { id: 'aq-r-b1-1', skill: 'reading', cefrLevelTarget: 'B1', prompt: { question: 'Q7' }, correctAnswer: { answer: 'G' }, order: 7, createdAt: now },
  { id: 'aq-r-b1-2', skill: 'reading', cefrLevelTarget: 'B1', prompt: { question: 'Q8' }, correctAnswer: { answer: 'H' }, order: 8, createdAt: now },
  { id: 'aq-r-b1-3', skill: 'reading', cefrLevelTarget: 'B1', prompt: { question: 'Q9' }, correctAnswer: { answer: 'I' }, order: 9, createdAt: now },
];

describe('assessment routes', () => {
  let prisma: MockPrismaClient;
  let token: string;

  beforeEach(async () => {
    prisma = createMockPrisma();
    token = await signTestToken({ sub: 'user_123' });
  });

  describe('GET /assessment/item-bank', () => {
    it('returns 200 without a token', async () => {
      prisma.assessmentQuestion.findMany.mockResolvedValue([]);
      const res = await request(createApp(prisma)).get('/assessment/item-bank');
      expect(res.status).toBe(200);
    });

    it('returns items with item_id and difficulty_param', async () => {
      prisma.assessmentQuestion.findMany.mockResolvedValue(readingA1Questions);
      const res = await request(createApp(prisma)).get('/assessment/item-bank');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      for (const item of res.body) {
        expect(item).toHaveProperty('item_id');
        expect(item).toHaveProperty('difficulty_param');
        expect(typeof item.difficulty_param).toBe('number');
      }
    });

    it('maps A1 cefrLevelTarget to difficulty_param -2.0', async () => {
      prisma.assessmentQuestion.findMany.mockResolvedValue([readingA1Questions[0]]);
      const res = await request(createApp(prisma)).get('/assessment/item-bank');
      expect(res.body[0].difficulty_param).toBe(-2.0);
    });

    it('maps A2 cefrLevelTarget to difficulty_param -1.0', async () => {
      prisma.assessmentQuestion.findMany.mockResolvedValue([readingA2Questions[0]]);
      const res = await request(createApp(prisma)).get('/assessment/item-bank');
      expect(res.body[0].difficulty_param).toBe(-1.0);
    });

    it('maps id to item_id', async () => {
      prisma.assessmentQuestion.findMany.mockResolvedValue([readingA1Questions[0]]);
      const res = await request(createApp(prisma)).get('/assessment/item-bank');
      expect(res.body[0].item_id).toBe('aq-r-a1-1');
    });

    it('passes skill filter to the query', async () => {
      prisma.assessmentQuestion.findMany.mockResolvedValue([]);
      await request(createApp(prisma)).get('/assessment/item-bank?skill=READING');
      expect(prisma.assessmentQuestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { skill: 'READING' } }),
      );
    });

    it('does not expose prompt or correctAnswer', async () => {
      prisma.assessmentQuestion.findMany.mockResolvedValue([readingA1Questions[0]]);
      const res = await request(createApp(prisma)).get('/assessment/item-bank');
      expect(res.body[0]).not.toHaveProperty('prompt');
      expect(res.body[0]).not.toHaveProperty('correctAnswer');
    });
  });

  describe('GET /assessment/questions', () => {
    it('returns 401 without a token', async () => {
      const res = await request(createApp(prisma)).get('/assessment/questions');
      expect(res.status).toBe(401);
    });

    it('returns questions without correctAnswer', async () => {
      prisma.assessmentQuestion.findMany.mockResolvedValue(readingA1Questions);

      const res = await request(createApp(prisma))
        .get('/assessment/questions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      for (const q of res.body) {
        expect(q).not.toHaveProperty('correctAnswer');
        expect(q).toHaveProperty('id');
        expect(q).toHaveProperty('skill');
        expect(q).toHaveProperty('cefrLevelTarget');
        expect(q).toHaveProperty('prompt');
      }
    });

    it('passes skill filter to the query', async () => {
      prisma.assessmentQuestion.findMany.mockResolvedValue([]);

      await request(createApp(prisma))
        .get('/assessment/questions?skill=reading')
        .set('Authorization', `Bearer ${token}`);

      expect(prisma.assessmentQuestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { skill: 'reading' } }),
      );
    });
  });

  describe('POST /assessment/score', () => {
    it('returns 400 when answers is missing', async () => {
      const res = await request(createApp(prisma))
        .post('/assessment/score')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('scores all correct → highest level returned', async () => {
      const allQuestions = [...readingA1Questions, ...readingA2Questions];
      prisma.assessmentQuestion.findMany.mockResolvedValue(allQuestions);

      const answers = allQuestions.map((q) => ({
        questionId: q.id,
        answer: q.correctAnswer,
      }));

      const res = await request(createApp(prisma))
        .post('/assessment/score')
        .set('Authorization', `Bearer ${token}`)
        .send({ answers });

      expect(res.status).toBe(200);
      expect(res.body.levels.reading).toBe('A2');
      expect(res.body.correctAnswers).toBe(6);
      expect(res.body.totalQuestions).toBe(6);
    });

    it('scores below threshold at A2 → falls back to A1', async () => {
      const allQuestions = [...readingA1Questions, ...readingA2Questions];
      prisma.assessmentQuestion.findMany.mockResolvedValue(allQuestions);

      // All A1 correct, all A2 wrong
      const answers = [
        ...readingA1Questions.map((q) => ({ questionId: q.id, answer: q.correctAnswer })),
        ...readingA2Questions.map((q) => ({ questionId: q.id, answer: { answer: 'wrong' } })),
      ];

      const res = await request(createApp(prisma))
        .post('/assessment/score')
        .set('Authorization', `Bearer ${token}`)
        .send({ answers });

      expect(res.status).toBe(200);
      expect(res.body.levels.reading).toBe('A1');
      expect(res.body.correctAnswers).toBe(3);
      expect(res.body.totalQuestions).toBe(6);
    });

    it('is deterministic — same answers always produce the same result', async () => {
      prisma.assessmentQuestion.findMany.mockResolvedValue(readingA1Questions);

      const answers = readingA1Questions.map((q) => ({
        questionId: q.id,
        answer: q.correctAnswer,
      }));

      const app = createApp(prisma);
      const [res1, res2] = await Promise.all([
        request(app).post('/assessment/score').set('Authorization', `Bearer ${token}`).send({ answers }),
        request(app).post('/assessment/score').set('Authorization', `Bearer ${token}`).send({ answers }),
      ]);

      expect(res1.body).toEqual(res2.body);
    });

    it(`passes threshold: ${SCORING_THRESHOLD} — 2 of 3 correct passes`, async () => {
      prisma.assessmentQuestion.findMany.mockResolvedValue(readingA1Questions);

      const answers = [
        { questionId: 'aq-r-a1-1', answer: { answer: 'A' } },   // correct
        { questionId: 'aq-r-a1-2', answer: { answer: 'B' } },   // correct
        { questionId: 'aq-r-a1-3', answer: { answer: 'wrong' } }, // wrong → 2/3 = 0.67 ≥ 0.6
      ];

      const res = await request(createApp(prisma))
        .post('/assessment/score')
        .set('Authorization', `Bearer ${token}`)
        .send({ answers });

      expect(res.status).toBe(200);
      expect(res.body.levels.reading).toBe('A1');
      expect(res.body.correctAnswers).toBe(2);
      expect(res.body.totalQuestions).toBe(3);
    });

    it('uses sequential gating — failing A2 caps the result at A1 even if B1 passes', async () => {
      const allQuestions = [...readingA1Questions, ...readingA2Questions, ...readingB1Questions];
      prisma.assessmentQuestion.findMany.mockResolvedValue(allQuestions);

      const answers = [
        ...readingA1Questions.map((q) => ({ questionId: q.id, answer: q.correctAnswer })), // A1: 3/3 pass
        ...readingA2Questions.map((q) => ({ questionId: q.id, answer: { answer: 'wrong' } })), // A2: 0/3 fail
        ...readingB1Questions.map((q) => ({ questionId: q.id, answer: q.correctAnswer })), // B1: 3/3 pass
      ];

      const res = await request(createApp(prisma))
        .post('/assessment/score')
        .set('Authorization', `Bearer ${token}`)
        .send({ answers });

      expect(res.status).toBe(200);
      expect(res.body.levels.reading).toBe('A1');
    });

    it('returns empty levels when no answers provided', async () => {
      prisma.assessmentQuestion.findMany.mockResolvedValue([]);

      const res = await request(createApp(prisma))
        .post('/assessment/score')
        .set('Authorization', `Bearer ${token}`)
        .send({ answers: [] });

      expect(res.status).toBe(200);
      expect(res.body.levels).toEqual({});
      expect(res.body.correctAnswers).toBe(0);
      expect(res.body.totalQuestions).toBe(0);
    });
  });
});

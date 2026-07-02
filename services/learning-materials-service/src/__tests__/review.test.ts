import { signTestToken } from '@ai-agentic-english/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { MockPrismaClient, createMockPrisma } from './testPrisma';

const now = new Date('2024-01-01T00:00:00.000Z');

const vocabRow = {
  id: 'vocab-1',
  lemma: 'run',
  pos: 'verb',
  cefrLevel: 'A2',
  freqRank: null,
  domainTag: 'general',
  source: 'cefr-j',
  license: 'seed license',
  createdAt: now,
  updatedAt: now,
  senses: [
    {
      id: 'sense-2',
      vocabEntryId: 'vocab-1',
      senseRank: 2,
      definition: 'to manage something',
      example: 'She runs the team.',
      synonyms: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'sense-1',
      vocabEntryId: 'vocab-1',
      senseRank: 1,
      definition: 'to move fast on foot',
      example: 'I run every day.',
      synonyms: ['jog'],
      createdAt: now,
      updatedAt: now,
    },
  ],
  pronunciations: [
    {
      id: 'pron-2',
      vocabEntryId: 'vocab-1',
      ipa: 'r ah n',
      variant: 'fallback',
      isPrimary: false,
      audioKey: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'pron-1',
      vocabEntryId: 'vocab-1',
      ipa: 'run-ipa',
      variant: 'us',
      isPrimary: true,
      audioKey: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
};

const grammarSummaryRows = [
  {
    id: 'gp-2',
    title: 'Passive form',
    category: 'passive voice',
    cefrLevel: 'B1',
    explanation: 'Use be plus past participle.',
    source: 'grammar-source',
    license: 'grammar-license',
    createdAt: now,
    updatedAt: now,
    _count: { examples: 2 },
  },
  {
    id: 'gp-1',
    title: 'I am',
    category: 'pronoun',
    cefrLevel: 'A1',
    explanation: 'Affirmative declarative form.',
    source: 'grammar-source',
    license: 'grammar-license',
    createdAt: now,
    updatedAt: now,
    _count: { examples: 1 },
  },
];

const grammarDetailRow = {
  id: 'gp-1',
  title: 'I am',
  category: 'pronoun',
  cefrLevel: 'A1',
  explanation: 'Affirmative declarative form.',
  source: 'grammar-source',
  license: 'grammar-license',
  createdAt: now,
  updatedAt: now,
  examples: [
    {
      id: 'gex-1',
      grammarPointId: 'gp-1',
      sentence: 'I am ready.',
      note: 'affirmative declarative',
      createdAt: now,
    },
  ],
};

describe('review routes', () => {
  let prisma: MockPrismaClient;
  let token: string;

  beforeEach(async () => {
    prisma = createMockPrisma();
    token = await signTestToken({ sub: 'user_123' });
  });

  it('requires auth for review-center APIs', async () => {
    const res = await request(createApp(prisma)).get('/review/flashcard-topics');
    expect(res.status).toBe(401);
  });

  describe('GET /review/flashcard-topics', () => {
    it('returns CEFR topics derived from vocab entry counts', async () => {
      prisma.vocabEntry.groupBy.mockResolvedValue([
        { cefrLevel: 'B1', _count: { _all: 10 } },
        { cefrLevel: 'A1', _count: { _all: 5 } },
      ]);

      const res = await request(createApp(prisma))
        .get('/review/flashcard-topics')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          id: 'A1',
          cefrLevel: 'A1',
          title: 'A1 Vocabulary',
          description: 'Starter vocabulary from the seeded learning-materials catalog.',
          totalCards: 5,
        },
        {
          id: 'B1',
          cefrLevel: 'B1',
          title: 'B1 Vocabulary',
          description: 'Intermediate vocabulary for work, study, and independent reading.',
          totalCards: 10,
        },
      ]);
      expect(prisma.vocabEntry.groupBy).toHaveBeenCalledWith({
        by: ['cefrLevel'],
        _count: { _all: true },
      });
    });
  });

  describe('GET /review/flashcard-topics/:cefrLevel/flashcards', () => {
    it('returns flashcards from vocab entries, primary senses, and primary pronunciations', async () => {
      prisma.vocabEntry.findMany.mockResolvedValue([vocabRow]);

      const res = await request(createApp(prisma))
        .get('/review/flashcard-topics/a2/flashcards')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          id: 'vocab-1',
          topicId: 'A2',
          term: 'run',
          partOfSpeech: 'verb',
          definition: 'to move fast on foot',
          example: 'I run every day.',
          ipa: 'run-ipa',
          cefrLevel: 'A2',
          domainTag: 'general',
          source: 'cefr-j',
          license: 'seed license',
        },
      ]);
      expect(prisma.vocabEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cefrLevel: 'A2' },
          include: {
            senses: { orderBy: { senseRank: 'asc' }, take: 1 },
            pronunciations: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], take: 1 },
          },
        }),
      );
    });

    it('rejects unknown CEFR topic ids', async () => {
      const res = await request(createApp(prisma))
        .get('/review/flashcard-topics/Z9/flashcards')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /review/flashcards', () => {
    it('supports read-only CEFR filtering and clamps large limits', async () => {
      prisma.vocabEntry.findMany.mockResolvedValue([]);

      const res = await request(createApp(prisma))
        .get('/review/flashcards?cefrLevel=A2&limit=500')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(prisma.vocabEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { cefrLevel: 'A2' }, take: 200 }),
      );
    });

    it('does not introduce flashcard mutation endpoints', async () => {
      const res = await request(createApp(prisma))
        .post('/review/flashcards')
        .set('Authorization', `Bearer ${token}`)
        .send({ term: 'new' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /review/grammar/sections', () => {
    it('groups grammar points by category', async () => {
      prisma.grammarPoint.findMany.mockResolvedValue(grammarSummaryRows);

      const res = await request(createApp(prisma))
        .get('/review/grammar/sections')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          id: 'passive-voice',
          category: 'passive voice',
          title: 'Passive Voice',
          lessonCount: 1,
          cefrLevels: ['B1'],
          lessons: [
            {
              id: 'gp-2',
              categoryId: 'passive-voice',
              category: 'passive voice',
              title: 'Passive form',
              cefrLevel: 'B1',
              explanation: 'Use be plus past participle.',
              exampleCount: 2,
            },
          ],
        },
        {
          id: 'pronoun',
          category: 'pronoun',
          title: 'Pronoun',
          lessonCount: 1,
          cefrLevels: ['A1'],
          lessons: [
            {
              id: 'gp-1',
              categoryId: 'pronoun',
              category: 'pronoun',
              title: 'I am',
              cefrLevel: 'A1',
              explanation: 'Affirmative declarative form.',
              exampleCount: 1,
            },
          ],
        },
      ]);
      expect(prisma.grammarPoint.findMany).toHaveBeenCalledWith({
        include: { _count: { select: { examples: true } } },
        orderBy: [{ category: 'asc' }, { cefrLevel: 'asc' }, { title: 'asc' }],
      });
    });
  });

  describe('GET /review/grammar/sections/:categoryId', () => {
    it('returns one grouped grammar section', async () => {
      prisma.grammarPoint.findMany.mockResolvedValue(grammarSummaryRows);

      const res = await request(createApp(prisma))
        .get('/review/grammar/sections/passive-voice')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('passive-voice');
      expect(res.body.lessons).toHaveLength(1);
    });

    it('returns 404 for missing grammar sections', async () => {
      prisma.grammarPoint.findMany.mockResolvedValue(grammarSummaryRows);

      const res = await request(createApp(prisma))
        .get('/review/grammar/sections/missing')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /review/grammar/lessons/:id', () => {
    it('returns grammar lesson details with examples', async () => {
      prisma.grammarPoint.findUnique.mockResolvedValue(grammarDetailRow);

      const res = await request(createApp(prisma))
        .get('/review/grammar/lessons/gp-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: 'gp-1',
        categoryId: 'pronoun',
        category: 'pronoun',
        title: 'I am',
        cefrLevel: 'A1',
        explanation: 'Affirmative declarative form.',
        exampleCount: 1,
        examples: [{ id: 'gex-1', sentence: 'I am ready.', note: 'affirmative declarative' }],
        source: 'grammar-source',
        license: 'grammar-license',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
      expect(prisma.grammarPoint.findUnique).toHaveBeenCalledWith({
        where: { id: 'gp-1' },
        include: { examples: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
      });
    });

    it('returns 404 when a grammar lesson is missing', async () => {
      prisma.grammarPoint.findUnique.mockResolvedValue(null);

      const res = await request(createApp(prisma))
        .get('/review/grammar/lessons/missing')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});

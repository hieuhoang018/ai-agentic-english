import { CefrLevel, NotFoundError, ValidationError, asyncHandler, requireAuth } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { AppPrismaClient } from '../lib/prisma';
import {
  REVIEW_CEFR_LEVELS,
  isReviewCefrLevel,
  toReviewFlashcardDto,
  toReviewFlashcardTopicDto,
  toReviewGrammarLessonDto,
  toReviewGrammarSectionsDto,
} from '../lib/mappers';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseCefrLevel(raw: unknown): CefrLevel | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') throw new ValidationError('cefrLevel must be a string');

  const value = raw.toUpperCase();
  if (!isReviewCefrLevel(value)) {
    throw new ValidationError(`cefrLevel must be one of ${REVIEW_CEFR_LEVELS.join(', ')}`);
  }

  return value;
}

async function getGrammarSections(prisma: AppPrismaClient) {
  const points = await prisma.grammarPoint.findMany({
    include: { _count: { select: { examples: true } } },
    orderBy: [{ category: 'asc' }, { cefrLevel: 'asc' }, { title: 'asc' }],
  });

  return toReviewGrammarSectionsDto(points);
}

export function createReviewRouter(prisma: AppPrismaClient): Router {
  const router = Router();

  router.get(
    '/flashcard-topics',
    requireAuth,
    asyncHandler(async (_req, res) => {
      const topics = await prisma.vocabEntry.groupBy({
        by: ['cefrLevel'],
        _count: { _all: true },
      });

      res.json(
        topics
          .map(toReviewFlashcardTopicDto)
          .sort(
            (a, b) =>
              REVIEW_CEFR_LEVELS.indexOf(a.cefrLevel) - REVIEW_CEFR_LEVELS.indexOf(b.cefrLevel),
          ),
      );
    }),
  );

  router.get(
    '/flashcard-topics/:cefrLevel/flashcards',
    requireAuth,
    asyncHandler(async (req, res) => {
      const cefrLevel = parseCefrLevel(req.params.cefrLevel)!;
      const cards = await prisma.vocabEntry.findMany({
        where: { cefrLevel },
        include: {
          senses: { orderBy: { senseRank: 'asc' }, take: 1 },
          pronunciations: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], take: 1 },
        },
        orderBy: [{ lemma: 'asc' }, { pos: 'asc' }],
        take: parseLimit(req.query.limit),
      });

      res.json(cards.map(toReviewFlashcardDto));
    }),
  );

  router.get(
    '/flashcards',
    requireAuth,
    asyncHandler(async (req, res) => {
      const cefrLevel = parseCefrLevel(req.query.cefrLevel);
      const cards = await prisma.vocabEntry.findMany({
        where: cefrLevel ? { cefrLevel } : {},
        include: {
          senses: { orderBy: { senseRank: 'asc' }, take: 1 },
          pronunciations: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], take: 1 },
        },
        orderBy: [{ cefrLevel: 'asc' }, { lemma: 'asc' }, { pos: 'asc' }],
        take: parseLimit(req.query.limit),
      });

      res.json(cards.map(toReviewFlashcardDto));
    }),
  );

  router.get(
    '/grammar/sections',
    requireAuth,
    asyncHandler(async (_req, res) => {
      res.json(await getGrammarSections(prisma));
    }),
  );

  router.get(
    '/grammar/sections/:categoryId',
    requireAuth,
    asyncHandler(async (req, res) => {
      const section = (await getGrammarSections(prisma)).find(
        (candidate) => candidate.id === req.params.categoryId,
      );
      if (!section) throw new NotFoundError('Grammar section not found');
      res.json(section);
    }),
  );

  router.get(
    '/grammar/lessons/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const point = await prisma.grammarPoint.findUnique({
        where: { id: req.params.id },
        include: { examples: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
      });
      if (!point) throw new NotFoundError('Grammar lesson not found');
      res.json(toReviewGrammarLessonDto(point));
    }),
  );

  return router;
}

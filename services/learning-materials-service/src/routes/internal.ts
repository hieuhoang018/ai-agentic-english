import { NotFoundError, PathDefinition, ValidationError, asyncHandler } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { Prisma } from '../../prisma/generated/client';
import { AppPrismaClient } from '../lib/prisma';
import {
  toExerciseInternalDto,
  toGrammarPointInternalDto,
  toLearningPathDto,
  toPassageInternalDto,
  toVocabEntryInternalDto,
} from '../lib/mappers';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export function createInternalRouter(prisma: AppPrismaClient): Router {
  const router = Router();

  router.get(
    '/exercises/:id',
    asyncHandler(async (req, res) => {
      const exercise = await prisma.exercise.findUnique({ where: { id: req.params.id } });
      if (!exercise) throw new NotFoundError('Exercise not found');
      res.json(toExerciseInternalDto(exercise));
    }),
  );

  router.get(
    '/learning-paths/:id',
    asyncHandler(async (req, res) => {
      const path = await prisma.learningPath.findUnique({ where: { id: req.params.id } });
      if (!path) throw new NotFoundError('Learning path not found');
      res.json(toLearningPathDto(path));
    }),
  );

  router.post(
    '/learning-paths',
    asyncHandler(async (req, res) => {
      const { userId, pathDefinition } = req.body as {
        userId?: string;
        pathDefinition?: PathDefinition;
      };

      if (!userId || typeof userId !== 'string') {
        throw new ValidationError('userId is required');
      }
      if (!pathDefinition || typeof pathDefinition !== 'object') {
        throw new ValidationError('pathDefinition is required');
      }

      const existing = await prisma.learningPath.findFirst({
        where: { userId, status: 'active' },
        orderBy: { version: 'desc' },
      });

      const nextVersion = existing ? existing.version + 1 : 1;

      const [, created] = await Promise.all([
        existing
          ? prisma.learningPath.update({
              where: { id: existing.id },
              data: { status: 'superseded' },
            })
          : Promise.resolve(null),
        prisma.learningPath.create({
          data: { userId, version: nextVersion, status: 'active', pathDefinition: pathDefinition as unknown as Prisma.InputJsonValue },
        }),
      ]);

      res.status(201).json(toLearningPathDto(created));
    }),
  );

  router.get(
    '/catalog/summary',
    asyncHandler(async (_req, res) => {
      const modules = await prisma.module.findMany({
        include: {
          lessons: {
            include: {
              exercises: {
                select: { id: true },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              },
            },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { order: 'asc' },
      });

      let totalLessons = 0;
      let totalExercises = 0;

      const moduleSummaries = modules.map((m) => {
        const lessonCount = m.lessons.length;
        const exerciseCount = m.lessons.reduce((sum, l) => sum + l.exercises.length, 0);
        totalLessons += lessonCount;
        totalExercises += exerciseCount;
        return {
          id: m.id,
          title: m.title,
          cefrLevel: m.cefrLevel,
          skillFocus: m.skillFocus,
          lessonCount,
          exerciseCount,
          lessons: m.lessons.map((l) => ({
            id: l.id,
            exerciseIds: l.exercises.map((e) => e.id),
          })),
        };
      });

      res.json({
        modules: moduleSummaries,
        totalModules: modules.length,
        totalLessons,
        totalExercises,
      });
    }),
  );

  router.get(
    '/vocab',
    asyncHandler(async (req, res) => {
      const { cefrLevel, domainTag, lemma } = req.query as {
        cefrLevel?: string;
        domainTag?: string;
        lemma?: string;
      };
      const entries = await prisma.vocabEntry.findMany({
        where: {
          ...(cefrLevel ? { cefrLevel } : {}),
          ...(domainTag ? { domainTag } : {}),
          ...(lemma ? { lemma: { equals: lemma, mode: 'insensitive' } } : {}),
        },
        include: { senses: true, pronunciations: true },
        take: parseLimit(req.query.limit),
      });
      res.json(entries.map(toVocabEntryInternalDto));
    }),
  );

  router.get(
    '/grammar',
    asyncHandler(async (req, res) => {
      const { cefrLevel, category } = req.query as { cefrLevel?: string; category?: string };
      const points = await prisma.grammarPoint.findMany({
        where: {
          ...(cefrLevel ? { cefrLevel } : {}),
          ...(category ? { category } : {}),
        },
        include: { examples: true },
        take: parseLimit(req.query.limit),
      });
      res.json(points.map(toGrammarPointInternalDto));
    }),
  );

  router.get(
    '/passages',
    asyncHandler(async (req, res) => {
      const { cefrLevel, topicTag } = req.query as { cefrLevel?: string; topicTag?: string };
      const passages = await prisma.passage.findMany({
        where: {
          ...(cefrLevel ? { cefrLevel } : {}),
          ...(topicTag ? { topicTags: { has: topicTag } } : {}),
        },
        include: { mediaAsset: true },
        take: parseLimit(req.query.limit),
      });
      res.json(passages.map(toPassageInternalDto));
    }),
  );

  return router;
}

import { ErrorCategory, asyncHandler, requireAuth } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { HighlightContentGenerator } from '../lib/highlightContentGenerator';
import { AppPrismaClient } from '../lib/prisma';

const MAX_HIGHLIGHT_MISTAKES = 5;
const MAX_HIGHLIGHT_VOCAB = 10;

export function createReviewCenterRouter(prisma: AppPrismaClient, contentGenerator: HighlightContentGenerator): Router {
  const router = Router();

  router.get(
    '/highlights',
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = req.auth!.userId;

      const mistakeGroups = await prisma.mistake.groupBy({
        by: ['errorCategory', 'errorLabel'],
        where: { userId },
        _count: { _all: true },
        _max: { createdAt: true },
        orderBy: { _count: { errorLabel: 'desc' } },
        take: MAX_HIGHLIGHT_MISTAKES,
      });

      const mistakes = await Promise.all(
        mistakeGroups.map(async (group) => {
          const content = await contentGenerator.generateMistakeExplanation({
            userId,
            errorCategory: group.errorCategory as ErrorCategory,
            errorLabel: group.errorLabel,
          });
          return {
            errorCategory: group.errorCategory as ErrorCategory,
            errorLabel: group.errorLabel,
            occurrences: group._count._all,
            lastOccurredAt: group._max.createdAt!.toISOString(),
            ...content,
          };
        }),
      );

      const dueVocabSchedules = await prisma.reviewSchedule.findMany({
        where: { userId, itemType: 'vocab', due: { lte: new Date() } },
        orderBy: { due: 'asc' },
        take: MAX_HIGHLIGHT_VOCAB,
      });

      const vocabItems = dueVocabSchedules.length
        ? await prisma.vocabItem.findMany({
            where: { id: { in: dueVocabSchedules.map((s) => s.itemId) } },
          })
        : [];
      const vocabById = new Map(vocabItems.map((v) => [v.id, v]));

      const vocab = (
        await Promise.all(
          dueVocabSchedules.map(async (schedule) => {
            const item = vocabById.get(schedule.itemId);
            if (!item) return null;

            const content = await contentGenerator.generateVocabExample({ userId, term: item.term, meaning: item.meaning });
            return {
              vocabItemId: item.id,
              term: item.term,
              meaning: item.meaning,
              due: schedule.due.toISOString(),
              ...content,
            };
          }),
        )
      ).filter((v) => v !== null);

      res.json({ mistakes, vocab });
    }),
  );

  return router;
}

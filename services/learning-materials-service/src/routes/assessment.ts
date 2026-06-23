import { ValidationError, asyncHandler, requireAuth } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { AppPrismaClient } from '../lib/prisma';
import { toAssessmentQuestionDto } from '../lib/mappers';
import { scoreAssessment } from '../scoring/assessmentScorer';

const CEFR_TO_THETA: Record<string, number> = {
  A1: -2.0,
  A2: -1.0,
  B1: 0.0,
  B2: 1.0,
  C1: 2.0,
  C2: 3.0,
};

export function createAssessmentRouter(prisma: AppPrismaClient): Router {
  const router = Router();

  // Service-to-service endpoint for CAT item bank — no auth, IRT format.
  router.get(
    '/item-bank',
    asyncHandler(async (req, res) => {
      const where = req.query.skill ? { skill: String(req.query.skill) } : {};
      const questions = await prisma.assessmentQuestion.findMany({ where });
      res.json(
        questions.map((q) => ({
          item_id: q.id,
          difficulty_param: CEFR_TO_THETA[q.cefrLevelTarget] ?? 0.0,
        })),
      );
    }),
  );

  router.get(
    '/questions',
    requireAuth,
    asyncHandler(async (req, res) => {
      const where = req.query.skill ? { skill: String(req.query.skill) } : {};
      const questions = await prisma.assessmentQuestion.findMany({
        where,
        orderBy: [{ skill: 'asc' }, { cefrLevelTarget: 'asc' }, { order: 'asc' }],
      });
      res.json(questions.map(toAssessmentQuestionDto));
    }),
  );

  router.post(
    '/score',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { answers } = req.body as {
        answers?: Array<{ questionId: string; answer: unknown }>;
      };

      if (!Array.isArray(answers)) {
        throw new ValidationError('answers must be an array');
      }

      const questionIds = answers.map((a) => a.questionId);
      const questions = await prisma.assessmentQuestion.findMany({
        where: { id: { in: questionIds } },
      });

      const result = scoreAssessment(questions, answers);
      res.json(result);
    }),
  );

  return router;
}

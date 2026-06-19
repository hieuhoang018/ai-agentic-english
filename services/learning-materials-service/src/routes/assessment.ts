import { ValidationError, asyncHandler, requireAuth } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { AppPrismaClient } from '../lib/prisma';
import { toAssessmentQuestionDto } from '../lib/mappers';
import { scoreAssessment } from '../scoring/assessmentScorer';

export function createAssessmentRouter(prisma: AppPrismaClient): Router {
  const router = Router();

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

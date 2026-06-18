import { AttemptRecordedEvent, EventBus, LlmClient, ValidationError, asyncHandler, requireAuth } from '@ai-agentic-english/shared';
import { randomUUID } from 'crypto';
import { Router } from 'express';
import { gradeDeterministic } from '../grading';
import { LearningMaterialsClient } from '../lib/learningMaterialsClient';

const ATTEMPT_RECORDED_TOPIC = 'attempt.recorded';

export function createGradingRouter(
  llmClient: LlmClient,
  learningMaterials: LearningMaterialsClient,
  eventBus: EventBus,
): Router {
  const router = Router();

  router.post(
    '/submit',
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = req.auth!.userId;
      const { exerciseId, submittedAnswer } = req.body as { exerciseId?: string; submittedAnswer?: unknown };

      if (!exerciseId || typeof exerciseId !== 'string') {
        throw new ValidationError('exerciseId is required');
      }

      const exercise = await learningMaterials.getExercise(exerciseId);

      const deterministic = gradeDeterministic(exercise, submittedAnswer);
      let result: { isCorrect: boolean; score?: number; feedback?: string };
      let errorLabels: AttemptRecordedEvent['errorLabels'];
      let gradedBy: AttemptRecordedEvent['gradedBy'];

      if (deterministic) {
        gradedBy = 'deterministic';
        errorLabels = [];
        result = {
          isCorrect: deterministic.isCorrect,
          score: deterministic.score,
          feedback: deterministic.isCorrect ? 'Correct!' : 'Not quite — review and try again.',
        };
      } else {
        const llmResult = await llmClient.gradeOpenResponse({ exercise, submittedAnswer });
        gradedBy = 'llm';
        errorLabels = llmResult.errorLabels;
        result = { isCorrect: llmResult.isCorrect, score: llmResult.score, feedback: llmResult.feedback };
      }

      res.json(result);

      const attemptId = randomUUID();
      const event: AttemptRecordedEvent = {
        eventId: randomUUID(),
        schemaVersion: 1,
        occurredAt: new Date().toISOString(),
        type: 'attempt.recorded',
        userId,
        exerciseId,
        attemptId,
        submittedAnswer,
        isCorrect: result.isCorrect,
        score: result.score,
        feedback: result.feedback,
        errorLabels,
        gradedBy,
      };

      await eventBus.publish(ATTEMPT_RECORDED_TOPIC, { type: event.type, occurredAt: event.occurredAt, payload: event }, userId);
    }),
  );

  return router;
}

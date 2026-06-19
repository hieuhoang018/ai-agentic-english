import { AttemptRecordedEvent } from '@ai-agentic-english/shared';
import { Prisma } from '../../../prisma/generated/client';
import { Grade, Rating, State, applyReview, createInitialReviewSchedule } from '../../fsrs/scheduler';
import { LearningMaterialsClient } from '../../lib/learningMaterialsClient';
import { getNextPosition } from '../../lib/pathProgression';
import { AppPrismaClient } from '../../lib/prisma';

const EXERCISE_ITEM_TYPE = 'exercise';

// Objective exercises report isCorrect with no score; open-ended ones add a 0-1 score from
// LlmClient.gradeOpenResponse — translate both into an FSRS grade deterministically.
function gradeFromAttempt(event: AttemptRecordedEvent): Grade {
  if (!event.isCorrect) return Rating.Again;
  if (event.score === undefined) return Rating.Good;
  if (event.score >= 0.95) return Rating.Easy;
  if (event.score >= 0.7) return Rating.Good;
  return Rating.Hard;
}

export async function consumeAttemptRecorded(
  prisma: AppPrismaClient,
  event: AttemptRecordedEvent,
  learningMaterials: LearningMaterialsClient,
  now: Date = new Date(),
): Promise<void> {
  const { userId, exerciseId, attemptId, submittedAnswer, isCorrect, score, feedback, errorLabels, gradedBy } = event;

  await prisma.attempt.create({
    data: {
      id: attemptId,
      userId,
      exerciseId,
      submittedAnswer: (submittedAnswer ?? null) as Prisma.InputJsonValue,
      isCorrect,
      score: score ?? null,
      feedback: (feedback ?? null) as Prisma.InputJsonValue,
      gradedBy,
    },
  });

  if (errorLabels.length > 0) {
    await prisma.mistake.createMany({
      data: errorLabels.map((error) => ({
        userId,
        exerciseId,
        attemptId,
        errorCategory: error.category,
        errorLabel: error.label,
        detail: (error.detail ?? {}) as Prisma.InputJsonValue,
      })),
    });
  }

  const existingSchedule = await prisma.reviewSchedule.findUnique({
    where: { userId_itemId_itemType: { userId, itemId: exerciseId, itemType: EXERCISE_ITEM_TYPE } },
  });

  const currentState = existingSchedule
    ? {
        due: existingSchedule.due,
        stability: existingSchedule.stability,
        difficulty: existingSchedule.difficulty,
        lastReviewedAt: existingSchedule.lastReviewedAt,
        reps: existingSchedule.reps,
        lapses: existingSchedule.lapses,
        state: existingSchedule.state as State,
      }
    : createInitialReviewSchedule(now);

  const nextState = applyReview(currentState, gradeFromAttempt(event), now);

  await prisma.reviewSchedule.upsert({
    where: { userId_itemId_itemType: { userId, itemId: exerciseId, itemType: EXERCISE_ITEM_TYPE } },
    create: { userId, itemId: exerciseId, itemType: EXERCISE_ITEM_TYPE, ...nextState },
    update: { ...nextState },
  });

  if (isCorrect) {
    const progress = await prisma.progress.findUnique({ where: { userId } });
    if (progress) {
      const completed = new Set(progress.completedExerciseIds as string[]);
      completed.add(exerciseId);

      const path = await learningMaterials.getLearningPath(progress.pathId);
      const next = getNextPosition(path.pathDefinition, exerciseId);

      await prisma.progress.update({
        where: { userId },
        data: {
          completedExerciseIds: Array.from(completed) as Prisma.InputJsonValue,
          ...(next
            ? { currentModuleId: next.moduleId, currentLessonId: next.lessonId, currentExerciseId: next.exerciseId }
            : {}),
        },
      });
    }
  }
}

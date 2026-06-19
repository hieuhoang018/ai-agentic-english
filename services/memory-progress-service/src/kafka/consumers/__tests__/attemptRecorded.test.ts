import { AttemptRecordedEvent, EventBus, InMemoryEventBus } from '@ai-agentic-english/shared';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { State } from '../../../fsrs/scheduler';
import { LearningMaterialsClient } from '../../../lib/learningMaterialsClient';
import { MockPrismaClient, createMockPrisma } from '../../../__tests__/testPrisma';
import { consumeAttemptRecorded } from '../attemptRecorded';

const now = new Date('2024-01-10T00:00:00.000Z');

// Single-exercise path by default — getNextPosition resolves to null, so existing
// completedExerciseIds-only assertions stay valid unless a test overrides this mock.
function createLearningMaterials(pathDefinition: unknown = { modules: [{ moduleId: 'mod-1', lessons: [{ lessonId: 'les-1', exerciseIds: ['ex-1'] }] }] }): LearningMaterialsClient {
  return {
    getExercise: vi.fn(),
    getLearningPath: vi.fn().mockResolvedValue({
      id: 'path-1',
      userId: 'user_123',
      version: 1,
      status: 'active',
      generatedAt: now.toISOString(),
      pathDefinition,
    }),
  } as unknown as LearningMaterialsClient;
}

function baseEvent(overrides: Partial<AttemptRecordedEvent> = {}): AttemptRecordedEvent {
  return {
    eventId: 'evt-1',
    schemaVersion: 1,
    occurredAt: now.toISOString(),
    type: 'attempt.recorded',
    userId: 'user_123',
    exerciseId: 'ex-1',
    attemptId: 'att-1',
    submittedAnswer: { answer: 'Red' },
    isCorrect: true,
    errorLabels: [],
    gradedBy: 'deterministic',
    ...overrides,
  };
}

describe('consumeAttemptRecorded', () => {
  let prisma: MockPrismaClient;
  let learningMaterials: LearningMaterialsClient;
  let eventBus: EventBus;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.reviewSchedule.findUnique.mockResolvedValue(null);
    prisma.progress.findUnique.mockResolvedValue(null);
    prisma.learnerModel.findUnique.mockResolvedValue(null);
    learningMaterials = createLearningMaterials();
    eventBus = new InMemoryEventBus();
  });

  it('records the attempt', async () => {
    await consumeAttemptRecorded(prisma, baseEvent(), learningMaterials, eventBus, now);

    expect(prisma.attempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'att-1',
        userId: 'user_123',
        exerciseId: 'ex-1',
        isCorrect: true,
        gradedBy: 'deterministic',
      }),
    });
  });

  it('creates a Mistake row per error label when not correct', async () => {
    await consumeAttemptRecorded(
      prisma,
      baseEvent({
        isCorrect: false,
        errorLabels: [
          { category: 'grammar', label: 'subject-verb-agreement' },
          { category: 'vocab', label: 'wrong-word-choice' },
        ],
      }),
      learningMaterials,
      eventBus,
      now,
    );

    expect(prisma.mistake.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: 'user_123', attemptId: 'att-1', errorCategory: 'grammar', errorLabel: 'subject-verb-agreement' }),
        expect.objectContaining({ userId: 'user_123', attemptId: 'att-1', errorCategory: 'vocab', errorLabel: 'wrong-word-choice' }),
      ],
    });
  });

  it('does not write mistakes when there are none', async () => {
    await consumeAttemptRecorded(prisma, baseEvent(), learningMaterials, eventBus, now);
    expect(prisma.mistake.createMany).not.toHaveBeenCalled();
  });

  it('creates a fresh ReviewSchedule on first attempt (correct → Good grade)', async () => {
    await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: true }), learningMaterials, eventBus, now);

    expect(prisma.reviewSchedule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_itemId_itemType: { userId: 'user_123', itemId: 'ex-1', itemType: 'exercise' } },
        create: expect.objectContaining({ userId: 'user_123', itemId: 'ex-1', itemType: 'exercise', state: State.Review }),
      }),
    );
  });

  it('advances an existing ReviewSchedule deterministically (wrong answer → lapse)', async () => {
    prisma.reviewSchedule.findUnique.mockResolvedValue({
      id: 'rs-1',
      userId: 'user_123',
      itemId: 'ex-1',
      itemType: 'exercise',
      due: new Date('2024-01-09T00:00:00.000Z'),
      stability: 5,
      difficulty: 3,
      lastReviewedAt: new Date('2024-01-05T00:00:00.000Z'),
      reps: 2,
      lapses: 0,
      state: State.Review,
    });

    await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: false }), learningMaterials, eventBus, now);

    const call = prisma.reviewSchedule.upsert.mock.calls[0][0];
    expect(call.update.lapses).toBe(1);
    expect(call.update.reps).toBe(3);
  });

  it('appends the exercise to completedExerciseIds when correct and progress exists', async () => {
    prisma.progress.findUnique.mockResolvedValue({
      userId: 'user_123',
      pathId: 'path-1',
      completedExerciseIds: ['ex-0'],
    });

    await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: true }), learningMaterials, eventBus, now);

    expect(prisma.progress.update).toHaveBeenCalledWith({
      where: { userId: 'user_123' },
      data: { completedExerciseIds: ['ex-0', 'ex-1'] },
    });
  });

  it('does not duplicate an already-completed exercise', async () => {
    prisma.progress.findUnique.mockResolvedValue({
      userId: 'user_123',
      pathId: 'path-1',
      completedExerciseIds: ['ex-1'],
    });

    await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: true }), learningMaterials, eventBus, now);

    expect(prisma.progress.update).toHaveBeenCalledWith({
      where: { userId: 'user_123' },
      data: { completedExerciseIds: ['ex-1'] },
    });
  });

  it('advances current position to the next exercise in the path when one exists', async () => {
    prisma.progress.findUnique.mockResolvedValue({
      userId: 'user_123',
      pathId: 'path-1',
      currentLessonId: 'les-1',
      completedExerciseIds: [],
    });
    const multiExercisePath = {
      modules: [{ moduleId: 'mod-1', lessons: [{ lessonId: 'les-1', exerciseIds: ['ex-1', 'ex-2'] }] }],
    };

    await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: true }), createLearningMaterials(multiExercisePath), eventBus, now);

    expect(prisma.progress.update).toHaveBeenCalledWith({
      where: { userId: 'user_123' },
      data: {
        completedExerciseIds: ['ex-1'],
        currentModuleId: 'mod-1',
        currentLessonId: 'les-1',
        currentExerciseId: 'ex-2',
      },
    });
  });

  it('leaves current position untouched when the completed exercise was the last in the path', async () => {
    prisma.progress.findUnique.mockResolvedValue({
      userId: 'user_123',
      pathId: 'path-1',
      completedExerciseIds: [],
    });

    await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: true }), learningMaterials, eventBus, now);

    expect(prisma.progress.update).toHaveBeenCalledWith({
      where: { userId: 'user_123' },
      data: { completedExerciseIds: ['ex-1'] },
    });
  });

  it('does not touch progress when the attempt was incorrect', async () => {
    prisma.progress.findUnique.mockResolvedValue({
      userId: 'user_123',
      pathId: 'path-1',
      completedExerciseIds: [],
    });

    await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: false }), learningMaterials, eventBus, now);

    expect(prisma.progress.update).not.toHaveBeenCalled();
  });

  describe('achievements', () => {
    it('publishes first-lesson when the completed exercise crosses into a new lesson for the first time', async () => {
      prisma.progress.findUnique.mockResolvedValue({
        userId: 'user_123',
        pathId: 'path-1',
        currentLessonId: 'les-1',
        completedExerciseIds: [],
        firstLessonCompletedAt: null,
      });
      const twoLessonPath = {
        modules: [
          {
            moduleId: 'mod-1',
            lessons: [
              { lessonId: 'les-1', exerciseIds: ['ex-1'] },
              { lessonId: 'les-2', exerciseIds: ['ex-2'] },
            ],
          },
        ],
      };

      await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: true }), createLearningMaterials(twoLessonPath), eventBus, now);

      expect(prisma.progress.update).toHaveBeenCalledWith({
        where: { userId: 'user_123' },
        data: expect.objectContaining({ firstLessonCompletedAt: now }),
      });
      const published = (eventBus as InMemoryEventBus).published;
      expect(published).toContainEqual(
        expect.objectContaining({
          topic: 'achievement.unlocked',
          event: expect.objectContaining({ payload: expect.objectContaining({ userId: 'user_123', achievementType: 'first-lesson' }) }),
        }),
      );
    });

    it('does not re-publish first-lesson once already recorded', async () => {
      prisma.progress.findUnique.mockResolvedValue({
        userId: 'user_123',
        pathId: 'path-1',
        currentLessonId: 'les-1',
        completedExerciseIds: [],
        firstLessonCompletedAt: new Date('2024-01-01T00:00:00.000Z'),
      });
      const twoLessonPath = {
        modules: [
          {
            moduleId: 'mod-1',
            lessons: [
              { lessonId: 'les-1', exerciseIds: ['ex-1'] },
              { lessonId: 'les-2', exerciseIds: ['ex-2'] },
            ],
          },
        ],
      };

      await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: true }), createLearningMaterials(twoLessonPath), eventBus, now);

      const published = (eventBus as InMemoryEventBus).published;
      expect(published.some((p) => p.topic === 'achievement.unlocked')).toBe(false);
    });

    it('increments the streak on a consecutive calendar day and publishes 7-day-streak at exactly 7', async () => {
      prisma.learnerModel.findUnique.mockResolvedValue({
        userId: 'user_123',
        currentStreakDays: 6,
        lastActivityDate: new Date('2024-01-09T00:00:00.000Z'),
      });

      await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: true }), learningMaterials, eventBus, now);

      expect(prisma.learnerModel.update).toHaveBeenCalledWith({
        where: { userId: 'user_123' },
        data: { currentStreakDays: 7, lastActivityDate: now },
      });
      const published = (eventBus as InMemoryEventBus).published;
      expect(published).toContainEqual(
        expect.objectContaining({
          topic: 'achievement.unlocked',
          event: expect.objectContaining({ payload: expect.objectContaining({ userId: 'user_123', achievementType: '7-day-streak' }) }),
        }),
      );
    });

    it('resets the streak to 1 after a gap of more than one day', async () => {
      prisma.learnerModel.findUnique.mockResolvedValue({
        userId: 'user_123',
        currentStreakDays: 5,
        lastActivityDate: new Date('2024-01-01T00:00:00.000Z'),
      });

      await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: true }), learningMaterials, eventBus, now);

      expect(prisma.learnerModel.update).toHaveBeenCalledWith({
        where: { userId: 'user_123' },
        data: { currentStreakDays: 1, lastActivityDate: now },
      });
    });

    it('does not change the streak on a second attempt the same day', async () => {
      prisma.learnerModel.findUnique.mockResolvedValue({
        userId: 'user_123',
        currentStreakDays: 3,
        lastActivityDate: new Date('2024-01-10T00:00:00.000Z'),
      });

      await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: true }), learningMaterials, eventBus, now);

      expect(prisma.learnerModel.update).toHaveBeenCalledWith({
        where: { userId: 'user_123' },
        data: { currentStreakDays: 3, lastActivityDate: now },
      });
    });
  });
});

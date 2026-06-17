import { AttemptRecordedEvent } from '@ai-agentic-english/shared';
import { describe, expect, it, beforeEach } from 'vitest';
import { State } from '../../../fsrs/scheduler';
import { MockPrismaClient, createMockPrisma } from '../../../__tests__/testPrisma';
import { consumeAttemptRecorded } from '../attemptRecorded';

const now = new Date('2024-01-10T00:00:00.000Z');

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

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.reviewSchedule.findUnique.mockResolvedValue(null);
    prisma.progress.findUnique.mockResolvedValue(null);
  });

  it('records the attempt', async () => {
    await consumeAttemptRecorded(prisma, baseEvent(), now);

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
    await consumeAttemptRecorded(prisma, baseEvent(), now);
    expect(prisma.mistake.createMany).not.toHaveBeenCalled();
  });

  it('creates a fresh ReviewSchedule on first attempt (correct → Good grade)', async () => {
    await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: true }), now);

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

    await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: false }), now);

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

    await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: true }), now);

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

    await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: true }), now);

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

    await consumeAttemptRecorded(prisma, baseEvent({ isCorrect: false }), now);

    expect(prisma.progress.update).not.toHaveBeenCalled();
  });
});

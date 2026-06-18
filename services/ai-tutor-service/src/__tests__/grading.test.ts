import { ExerciseInternalDto, InMemoryEventBus, LlmClient, signTestToken } from '@ai-agentic-english/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, HealthCheckClient } from '../app';
import { LearningMaterialsClient } from '../lib/learningMaterialsClient';

const fakePrisma: HealthCheckClient = { $queryRaw: (async () => [{ '?column?': 1 }]) as HealthCheckClient['$queryRaw'] };

const now = new Date('2024-01-01T00:00:00.000Z').toISOString();

const mcqExercise: ExerciseInternalDto = {
  id: 'ex-1',
  lessonId: 'les-1',
  type: 'mcq',
  prompt: { question: 'What colour is the apple?', options: ['Red', 'Blue'] },
  answerKey: { answer: 'Red' },
  difficulty: 'easy',
  skill: 'reading',
  createdAt: now,
  updatedAt: now,
};

// No answerKey-bearing seeded type exists for "open-ended" yet — simulate one with an
// unrecognized exercise type so gradeDeterministic falls through to the LLM, per the grading
// module's documented fallback behaviour.
const openEndedExercise: ExerciseInternalDto = { ...mcqExercise, id: 'ex-2', type: 'essay' as ExerciseInternalDto['type'] };

describe('POST /grading/submit', () => {
  let llmClient: LlmClient;
  let learningMaterials: LearningMaterialsClient;
  let eventBus: InMemoryEventBus;
  let token: string;

  beforeEach(async () => {
    llmClient = {
      generateLearningPath: vi.fn(),
      gradeOpenResponse: vi.fn().mockResolvedValue({
        isCorrect: true,
        score: 0.8,
        feedback: 'Good attempt — minor refinements possible.',
        errorLabels: [],
      }),
      generateHighlightContent: vi.fn(),
      tutorReply: vi.fn(),
      analyzeSessionTranscript: vi.fn(),
    };
    learningMaterials = {
      getExercise: vi.fn().mockImplementation((id: string) => Promise.resolve(id === 'ex-1' ? mcqExercise : openEndedExercise)),
      getCatalogSummary: vi.fn(),
      createLearningPath: vi.fn(),
    };
    eventBus = new InMemoryEventBus();
    token = await signTestToken({ sub: 'user_123' });
  });

  function buildApp() {
    return createApp(fakePrisma, llmClient, eventBus, undefined, learningMaterials);
  }

  it('returns 401 without a token', async () => {
    const res = await request(buildApp()).post('/grading/submit').send({ exerciseId: 'ex-1', submittedAnswer: 'Red' });
    expect(res.status).toBe(401);
  });

  it('grades a deterministic exercise correctly and publishes attempt.recorded', async () => {
    const res = await request(buildApp())
      .post('/grading/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ exerciseId: 'ex-1', submittedAnswer: 'Red' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isCorrect: true, score: 1, feedback: 'Correct!' });
    expect(llmClient.gradeOpenResponse).not.toHaveBeenCalled();

    expect(eventBus.published).toHaveLength(1);
    const published = eventBus.published[0];
    expect(published.topic).toBe('attempt.recorded');
    expect(published.event.payload).toMatchObject({
      userId: 'user_123',
      exerciseId: 'ex-1',
      isCorrect: true,
      score: 1,
      gradedBy: 'deterministic',
      errorLabels: [],
    });
  });

  it('grades a deterministic exercise incorrectly', async () => {
    const res = await request(buildApp())
      .post('/grading/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ exerciseId: 'ex-1', submittedAnswer: 'Blue' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isCorrect: false, score: 0, feedback: 'Not quite — review and try again.' });
  });

  it('falls back to LlmClient.gradeOpenResponse for an unrecognized exercise type', async () => {
    const res = await request(buildApp())
      .post('/grading/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ exerciseId: 'ex-2', submittedAnswer: 'some free text' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      isCorrect: true,
      score: 0.8,
      feedback: 'Good attempt — minor refinements possible.',
    });
    expect(llmClient.gradeOpenResponse).toHaveBeenCalledWith({ exercise: openEndedExercise, submittedAnswer: 'some free text' });

    const published = eventBus.published[0];
    expect(published.event.payload).toMatchObject({ gradedBy: 'llm' });
  });

  it('returns 400 without an exerciseId', async () => {
    const res = await request(buildApp()).post('/grading/submit').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });
});

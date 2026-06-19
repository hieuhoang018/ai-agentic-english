import { CatalogSummaryDto, EventBus, InMemoryEventBus, LearningPathDto, LlmClient } from '@ai-agentic-english/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, HealthCheckClient } from '../app';
import { LearningMaterialsClient } from '../lib/learningMaterialsClient';
import { MemoryProgressClient } from '../lib/memoryProgressClient';

const INTERNAL_SECRET = 'dev-internal-secret';
const INTERNAL_HEADER = 'x-internal-secret';

const fakePrisma: HealthCheckClient = { $queryRaw: (async () => [{ '?column?': 1 }]) as HealthCheckClient['$queryRaw'] };

const catalogSummary: CatalogSummaryDto = {
  modules: [{ id: 'mod-1', title: 'Basics', cefrLevel: 'A1', skillFocus: 'reading', lessonCount: 1, exerciseCount: 1 }],
  totalModules: 1,
  totalLessons: 1,
  totalExercises: 1,
};

const pathDefinition = {
  modules: [{ moduleId: 'mod-1', lessons: [{ lessonId: 'les-1', exerciseIds: ['ex-1'] }] }],
};

const createdPath: LearningPathDto = {
  id: 'path-1',
  userId: 'user_123',
  version: 1,
  status: 'active',
  generatedAt: new Date().toISOString(),
  pathDefinition,
};

describe('POST /internal/onboarding/generate-path', () => {
  let llmClient: LlmClient;
  let learningMaterials: LearningMaterialsClient;
  let memoryProgress: MemoryProgressClient;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    llmClient = {
      generateLearningPath: vi.fn().mockResolvedValue({ pathDefinition }),
      gradeOpenResponse: vi.fn(),
      generateHighlightContent: vi.fn(),
      tutorReply: vi.fn(),
      analyzeSessionTranscript: vi.fn(),
    };
    learningMaterials = {
      getExercise: vi.fn(),
      getCatalogSummary: vi.fn().mockResolvedValue(catalogSummary),
      createLearningPath: vi.fn().mockResolvedValue(createdPath),
    };
    memoryProgress = { initializeProgress: vi.fn().mockResolvedValue({}) };
  });

  function buildApp() {
    return createApp(fakePrisma, llmClient, eventBus, undefined, learningMaterials, memoryProgress);
  }

  it('returns 403 without the internal secret', async () => {
    const res = await request(buildApp())
      .post('/internal/onboarding/generate-path')
      .send({ userId: 'user_123', currentLevel: {}, dailyTimeBudgetMinutes: 15, goals: [] });
    expect(res.status).toBe(403);
  });

  it('orchestrates catalog -> LLM -> path creation -> progress init -> returns the path', async () => {
    const res = await request(buildApp())
      .post('/internal/onboarding/generate-path')
      .set(INTERNAL_HEADER, INTERNAL_SECRET)
      .send({ userId: 'user_123', currentLevel: { reading: 'A1' }, dailyTimeBudgetMinutes: 15, goals: ['job-interview'] });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(createdPath);
    expect(learningMaterials.getCatalogSummary).toHaveBeenCalled();
    expect(llmClient.generateLearningPath).toHaveBeenCalledWith(
      expect.objectContaining({ currentLevel: { reading: 'A1' }, dailyTimeBudgetMinutes: 15, goals: ['job-interview'], catalogSummary }),
    );
    expect(learningMaterials.createLearningPath).toHaveBeenCalledWith('user_123', pathDefinition);
    expect(memoryProgress.initializeProgress).toHaveBeenCalledWith('user_123', {
      pathId: 'path-1',
      currentModuleId: 'mod-1',
      currentLessonId: 'les-1',
      currentExerciseId: 'ex-1',
    });
    expect((eventBus as InMemoryEventBus).published).toContainEqual(
      expect.objectContaining({
        topic: 'learning-path.ready',
        key: 'user_123',
        event: expect.objectContaining({ payload: expect.objectContaining({ userId: 'user_123', pathId: 'path-1' }) }),
      }),
    );
  });

  it('returns 400 without a userId', async () => {
    const res = await request(buildApp())
      .post('/internal/onboarding/generate-path')
      .set(INTERNAL_HEADER, INTERNAL_SECRET)
      .send({ currentLevel: {}, dailyTimeBudgetMinutes: 15, goals: [] });

    expect(res.status).toBe(400);
  });
});

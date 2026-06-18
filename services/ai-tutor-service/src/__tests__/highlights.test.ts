import { LlmClient } from '@ai-agentic-english/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, HealthCheckClient } from '../app';
import { createInMemoryCacheClient } from '../lib/redisCache';

const INTERNAL_SECRET = 'dev-internal-secret';
const INTERNAL_HEADER = 'x-internal-secret';

const fakePrisma: HealthCheckClient = { $queryRaw: (async () => [{ '?column?': 1 }]) as HealthCheckClient['$queryRaw'] };

describe('POST /internal/highlights/generate-content', () => {
  let llmClient: LlmClient;

  beforeEach(() => {
    llmClient = {
      generateLearningPath: vi.fn(),
      gradeOpenResponse: vi.fn(),
      generateHighlightContent: vi.fn().mockResolvedValue({ explanation: 'exp', example: 'ex' }),
      tutorReply: vi.fn(),
      analyzeSessionTranscript: vi.fn(),
    };
  });

  it('returns 403 without the internal secret', async () => {
    const app = createApp(fakePrisma, llmClient, undefined, createInMemoryCacheClient());
    const res = await request(app)
      .post('/internal/highlights/generate-content')
      .send({ userId: 'user_123', kind: 'vocab', term: 'ubiquitous', meaning: 'present everywhere' });
    expect(res.status).toBe(403);
  });

  it('calls the LLM on a cache miss and caches the result', async () => {
    const app = createApp(fakePrisma, llmClient, undefined, createInMemoryCacheClient());
    const body = { userId: 'user_123', kind: 'vocab', term: 'ubiquitous', meaning: 'present everywhere' };

    const res = await request(app).post('/internal/highlights/generate-content').set(INTERNAL_HEADER, INTERNAL_SECRET).send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ explanation: 'exp', example: 'ex' });
    expect(llmClient.generateHighlightContent).toHaveBeenCalledTimes(1);
  });

  it('serves the second identical request from cache without calling the LLM again', async () => {
    const cache = createInMemoryCacheClient();
    const app = createApp(fakePrisma, llmClient, undefined, cache);
    const body = { userId: 'user_123', kind: 'vocab', term: 'ubiquitous', meaning: 'present everywhere' };

    await request(app).post('/internal/highlights/generate-content').set(INTERNAL_HEADER, INTERNAL_SECRET).send(body);
    const res = await request(app).post('/internal/highlights/generate-content').set(INTERNAL_HEADER, INTERNAL_SECRET).send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ explanation: 'exp', example: 'ex' });
    expect(llmClient.generateHighlightContent).toHaveBeenCalledTimes(1);
  });

  it('uses a different cache entry for a different userId with the same content', async () => {
    const cache = createInMemoryCacheClient();
    const app = createApp(fakePrisma, llmClient, undefined, cache);
    const body = { kind: 'vocab', term: 'ubiquitous', meaning: 'present everywhere' };

    await request(app).post('/internal/highlights/generate-content').set(INTERNAL_HEADER, INTERNAL_SECRET).send({ userId: 'user_123', ...body });
    await request(app).post('/internal/highlights/generate-content').set(INTERNAL_HEADER, INTERNAL_SECRET).send({ userId: 'user_456', ...body });

    expect(llmClient.generateHighlightContent).toHaveBeenCalledTimes(2);
  });

  it('returns 400 without a userId', async () => {
    const app = createApp(fakePrisma, llmClient, undefined, createInMemoryCacheClient());
    const res = await request(app)
      .post('/internal/highlights/generate-content')
      .set(INTERNAL_HEADER, INTERNAL_SECRET)
      .send({ kind: 'vocab', term: 'ubiquitous', meaning: 'present everywhere' });
    expect(res.status).toBe(400);
  });
});

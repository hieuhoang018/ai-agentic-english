import { TEST_WEBHOOK_SECRET } from '@ai-agentic-english/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createMockPrisma } from './testPrisma';

process.env.CLERK_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

describe('GET /health', () => {
  it('returns ok when the database is reachable', async () => {
    const app = createApp(createMockPrisma());

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'user-service' });
  });
});

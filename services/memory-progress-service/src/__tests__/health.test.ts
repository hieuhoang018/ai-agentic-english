import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createMockPrisma } from './testPrisma';

describe('GET /health', () => {
  it('returns ok when the database is reachable', async () => {
    const app = createApp(createMockPrisma());

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'memory-progress-service' });
  });
});

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, HealthCheckClient } from '../app';

const fakePrisma: HealthCheckClient = {
  $queryRaw: (async () => [{ '?column?': 1 }]) as HealthCheckClient['$queryRaw'],
};

describe('GET /health', () => {
  it('returns ok when the database is reachable', async () => {
    const app = createApp(fakePrisma);

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'notification-service' });
  });
});

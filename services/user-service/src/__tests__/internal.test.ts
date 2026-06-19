import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createMockPrisma, MockPrismaClient } from './testPrisma';

const INTERNAL_SECRET = 'dev-internal-secret';
const INTERNAL_HEADER = 'x-internal-secret';

describe('GET /internal/users', () => {
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('returns 403 without the internal secret header', async () => {
    const res = await request(createApp(prisma)).get('/internal/users');
    expect(res.status).toBe(403);
  });

  it('returns user summaries with settings, skipping users with no settings row', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        clerkUserId: 'user_123',
        email: 'a@example.com',
        name: 'Alice',
        settings: {
          dailyTimeBudgetMinutes: 20,
          preferredLanguage: 'en',
          reminderTime: '08:00',
          timezone: 'Asia/Ho_Chi_Minh',
          notificationChannelHints: {},
        },
      },
      {
        clerkUserId: 'user_456',
        email: 'b@example.com',
        name: null,
        settings: null,
      },
    ]);

    const res = await request(createApp(prisma)).get('/internal/users').set(INTERNAL_HEADER, INTERNAL_SECRET);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        clerkUserId: 'user_123',
        email: 'a@example.com',
        name: 'Alice',
        settings: {
          dailyTimeBudgetMinutes: 20,
          preferredLanguage: 'en',
          reminderTime: '08:00',
          timezone: 'Asia/Ho_Chi_Minh',
          notificationChannelHints: {},
        },
      },
    ]);
  });
});

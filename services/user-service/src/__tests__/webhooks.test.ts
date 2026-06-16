import { TEST_WEBHOOK_SECRET } from '@ai-agentic-english/shared';
import request from 'supertest';
import { Webhook } from 'svix';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createMockPrisma, MockPrismaClient } from './testPrisma';

function signPayload(payload: unknown): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(payload);
  const wh = new Webhook(TEST_WEBHOOK_SECRET);
  const timestamp = new Date();
  const signature = wh.sign('msg_test', timestamp, body);
  return {
    body,
    headers: {
      'svix-id': 'msg_test',
      'svix-timestamp': `${Math.floor(timestamp.getTime() / 1000)}`,
      'svix-signature': signature,
    },
  };
}

describe('POST /webhooks/clerk', () => {
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    process.env.CLERK_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  });

  it('rejects requests with an invalid signature', async () => {
    const app = createApp(prisma);
    const payload = {
      type: 'user.created',
      data: { id: 'user_123', email_addresses: [], first_name: null, last_name: null },
    };
    const body = JSON.stringify(payload);

    const res = await request(app)
      .post('/webhooks/clerk')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_test')
      .set('svix-timestamp', `${Math.floor(Date.now() / 1000)}`)
      .set('svix-signature', 'v1,invalidsignature')
      .send(body);

    expect(res.status).toBe(401);
  });

  it('upserts a user on user.created and user.updated', async () => {
    const app = createApp(prisma);
    prisma.user.upsert.mockResolvedValue({
      id: 'user-uuid-1',
      clerkUserId: 'user_123',
      email: 'test@example.com',
      name: 'Jane Doe',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const payload = {
      type: 'user.created',
      data: {
        id: 'user_123',
        email_addresses: [{ id: 'email_1', email_address: 'test@example.com' }],
        primary_email_address_id: 'email_1',
        first_name: 'Jane',
        last_name: 'Doe',
      },
    };
    const { body, headers } = signPayload(payload);

    const res = await request(app)
      .post('/webhooks/clerk')
      .set('Content-Type', 'application/json')
      .set(headers)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { clerkUserId: 'user_123' },
      create: {
        clerkUserId: 'user_123',
        email: 'test@example.com',
        name: 'Jane Doe',
        settings: { create: {} },
      },
      update: { email: 'test@example.com', name: 'Jane Doe' },
    });
  });

  it('deletes a user on user.deleted', async () => {
    const app = createApp(prisma);
    const payload = {
      type: 'user.deleted',
      data: { id: 'user_123' },
    };
    const { body, headers } = signPayload(payload);

    const res = await request(app)
      .post('/webhooks/clerk')
      .set('Content-Type', 'application/json')
      .set(headers)
      .send(body);

    expect(res.status).toBe(200);
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({ where: { clerkUserId: 'user_123' } });
  });
});

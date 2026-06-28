import { signTestToken } from '@ai-agentic-english/shared';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { AppPrismaClient } from '../lib/prisma';
import { StorageClient } from '../lib/storageClient';

const fakePrisma = {
  $queryRaw: async () => [{ '?column?': 1 }],
} as unknown as AppPrismaClient;

const fakeStorage: StorageClient = {
  generatePresignedGetUrl: vi.fn().mockResolvedValue('https://minio.example/passage-audio/voa/test.mp3?sig=abc'),
};

describe('GET /audio/url', () => {
  const app = createApp(fakePrisma, fakeStorage);
  let token: string;

  beforeAll(async () => {
    token = await signTestToken({ sub: 'user_test' });
  });

  it('returns a presigned URL for a valid bucket and key', async () => {
    const res = await request(app)
      .get('/audio/url')
      .set('Authorization', `Bearer ${token}`)
      .query({ bucket: 'passage-audio', key: 'voa/words-and-their-stories/test.mp3' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('url');
    expect(fakeStorage.generatePresignedGetUrl).toHaveBeenCalledWith(
      'passage-audio',
      'voa/words-and-their-stories/test.mp3',
    );
  });

  it('returns 400 for an unknown bucket', async () => {
    const res = await request(app)
      .get('/audio/url')
      .set('Authorization', `Bearer ${token}`)
      .query({ bucket: 'evil-bucket', key: 'voa/test.mp3' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when key is missing', async () => {
    const res = await request(app)
      .get('/audio/url')
      .set('Authorization', `Bearer ${token}`)
      .query({ bucket: 'passage-audio' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when bucket is missing', async () => {
    const res = await request(app)
      .get('/audio/url')
      .set('Authorization', `Bearer ${token}`)
      .query({ key: 'voa/test.mp3' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .get('/audio/url')
      .query({ bucket: 'passage-audio', key: 'voa/test.mp3' });

    expect(res.status).toBe(401);
  });
});

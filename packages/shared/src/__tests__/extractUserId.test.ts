import { describe, expect, it } from 'vitest';
import { extractUserId, requireAuth } from '../auth/extractUserId';
import { UnauthorizedError } from '../errors/AppError';
import { signTestToken } from '../testing';

describe('extractUserId', () => {
  it('returns the sub claim from a valid bearer token', async () => {
    const token = await signTestToken({ sub: 'user_123' });

    expect(extractUserId(`Bearer ${token}`)).toBe('user_123');
  });

  it('throws UnauthorizedError when the header is missing', () => {
    expect(() => extractUserId(undefined)).toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError when the header is not a bearer token', () => {
    expect(() => extractUserId('Basic abc123')).toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError when the token is malformed', () => {
    expect(() => extractUserId('Bearer not-a-jwt')).toThrow(UnauthorizedError);
  });
});

describe('requireAuth', () => {
  it('sets req.auth.userId and calls next() for a valid token', async () => {
    const token = await signTestToken({ sub: 'user_123' });
    const req = { headers: { authorization: `Bearer ${token}` } } as Parameters<typeof requireAuth>[0];
    let nextError: unknown;
    const next = (err?: unknown) => {
      nextError = err;
    };

    requireAuth(req, {} as never, next);

    expect(nextError).toBeUndefined();
    expect(req.auth).toEqual({ userId: 'user_123' });
  });

  it('calls next(err) with UnauthorizedError when the token is missing', () => {
    const req = { headers: {} } as Parameters<typeof requireAuth>[0];
    let nextError: unknown;
    const next = (err?: unknown) => {
      nextError = err;
    };

    requireAuth(req, {} as never, next);

    expect(nextError).toBeInstanceOf(UnauthorizedError);
  });
});

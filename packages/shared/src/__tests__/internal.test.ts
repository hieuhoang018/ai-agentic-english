import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInternalMiddleware } from '../http/internal';

describe('createInternalMiddleware', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws at construction when DEPLOY_ENV=production and the secret is the dev default', () => {
    vi.stubEnv('DEPLOY_ENV', 'production');

    expect(() => createInternalMiddleware('dev-internal-secret')).toThrow('INTERNAL_SECRET');
  });

  it('does not throw when DEPLOY_ENV is unset, even with the dev default secret', () => {
    expect(() => createInternalMiddleware('dev-internal-secret')).not.toThrow();
  });

  it('does not throw when DEPLOY_ENV=production and the secret is a real value', () => {
    vi.stubEnv('DEPLOY_ENV', 'production');

    expect(() => createInternalMiddleware('a-real-production-secret')).not.toThrow();
  });

  it('still rejects requests without the header, unrelated to the guard', () => {
    const middleware = createInternalMiddleware('secret-123');
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) } as any;
    const next = vi.fn();

    middleware({ headers: {} } as any, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

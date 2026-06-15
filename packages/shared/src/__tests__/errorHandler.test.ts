import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, UnauthorizedError, ValidationError } from '../errors/AppError';
import { errorHandler } from '../errors/errorHandler';

function runHandler(err: unknown) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status } as unknown as Parameters<typeof errorHandler>[2];

  errorHandler(err, {} as never, res, vi.fn());

  return { status, json };
}

describe('errorHandler', () => {
  it('maps NotFoundError to a 404 response', () => {
    const { status, json } = runHandler(new NotFoundError('missing'));

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: { code: 'NOT_FOUND', message: 'missing' } });
  });

  it('maps ValidationError to a 400 response', () => {
    const { status, json } = runHandler(new ValidationError('bad input'));

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: { code: 'VALIDATION_ERROR', message: 'bad input' } });
  });

  it('maps UnauthorizedError to a 401 response', () => {
    const { status, json } = runHandler(new UnauthorizedError());

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  });

  it('maps unknown errors to a 500 response', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { status, json } = runHandler(new Error('boom'));

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    consoleSpy.mockRestore();
  });
});

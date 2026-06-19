import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInternalHttpClient } from '../http/internalHttpClient';

describe('createInternalHttpClient', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET: sends correct URL and auth header, returns parsed body', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: '1' }) });
    const client = createInternalHttpClient('http://svc:4001', 'secret-123');

    const result = await client.get<{ id: string }>('/internal/users');

    expect(mockFetch).toHaveBeenCalledWith('http://svc:4001/internal/users', {
      method: 'GET',
      headers: { 'x-internal-secret': 'secret-123' },
    });
    expect(result).toEqual({ status: 200, body: { id: '1' } });
  });

  it('POST: sends JSON body and content-type header', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const client = createInternalHttpClient('http://svc:4002', 'secret-456');

    const result = await client.post<{ ok: boolean }>('/internal/resource', { name: 'test' });

    expect(mockFetch).toHaveBeenCalledWith('http://svc:4002/internal/resource', {
      method: 'POST',
      headers: { 'x-internal-secret': 'secret-456', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    });
    expect(result).toEqual({ status: 200, body: { ok: true } });
  });

  it('non-ok response: returns status and null body without throwing', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const client = createInternalHttpClient('http://svc:4001', 'secret');

    const result = await client.get<{ id: string }>('/internal/missing');

    expect(result).toEqual({ status: 503, body: null });
  });

  it('404 response: returns status 404 and null body', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const client = createInternalHttpClient('http://svc:4002', 'secret');

    const result = await client.get<{ id: string }>('/internal/exercises/unknown');

    expect(result).toEqual({ status: 404, body: null });
  });
});

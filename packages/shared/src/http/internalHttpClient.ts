import { assertProductionSecret } from '../env';

export interface InternalHttpResponse<T> {
  status: number;
  body: T | null;
}

export interface InternalHttpClient {
  get<T>(path: string): Promise<InternalHttpResponse<T>>;
  post<T>(path: string, body: unknown): Promise<InternalHttpResponse<T>>;
}

export function createInternalHttpClient(baseUrl: string, internalSecret: string): InternalHttpClient {
  assertProductionSecret(internalSecret, 'INTERNAL_SECRET');

  const authHeader = { 'x-internal-secret': internalSecret };

  async function execute<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<InternalHttpResponse<T>> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body !== undefined
        ? { ...authHeader, 'content-type': 'application/json' }
        : authHeader,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    if (!res.ok) return { status: res.status, body: null };
    return { status: res.status, body: (await res.json()) as T };
  }

  return {
    get: <T>(path: string) => execute<T>('GET', path),
    post: <T>(path: string, body: unknown) => execute<T>('POST', path, body),
  };
}

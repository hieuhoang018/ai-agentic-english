export type ApiError = {
  status: number;
  message: string;
  body?: unknown;
};

export type ApiFetchOptions = {
  method?: string;
  body?: unknown;
  token: string | null;
};

export type ApiRequestOptions = Omit<ApiFetchOptions, 'token'>;

function getApiBaseUrl() {
  const baseUrl =
    typeof window === 'undefined'
      ? (process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL)
      : process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    throw new Error('API_BASE_URL or NEXT_PUBLIC_API_BASE_URL is not configured.');
  }

  return baseUrl.replace(/\/$/, '');
}

function isRetryableFetchError(error: unknown) {
  return error instanceof TypeError && error.message === 'fetch failed';
}

async function fetchWithNetworkRetry(url: string, init: RequestInit, attempts: number) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryableFetchError(error)) break;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : 'unknown network error';
  throw new TypeError(`API request failed before reaching the gateway: ${init.method} ${url} (${detail})`);
}

function getErrorMessage(body: unknown, fallback: string) {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body as { message?: unknown };
    if (typeof message === 'string') return message;
  }

  return fallback;
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

export async function apiFetch<TResponse>(
  path: string,
  options: ApiFetchOptions,
): Promise<TResponse> {
  const method = options.method ?? 'GET';
  const url = `${getApiBaseUrl()}${path}`;
  const response = await fetchWithNetworkRetry(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }, method === 'GET' || method === 'HEAD' ? 2 : 1);

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw {
      status: response.status,
      message: getErrorMessage(body, response.statusText),
      body,
    } satisfies ApiError;
  }

  if (response.status === 204) return undefined as TResponse;
  return response.json() as Promise<TResponse>;
}

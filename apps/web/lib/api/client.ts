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
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is not configured.');
  }

  return baseUrl.replace(/\/$/, '');
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
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

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

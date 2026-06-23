import { auth } from '@clerk/nextjs/server';

import { apiFetch, type ApiRequestOptions } from './client';

export async function serverApiFetch<TResponse>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<TResponse> {
  const { getToken } = await auth();
  const token = await getToken();

  return apiFetch<TResponse>(path, { ...options, token });
}

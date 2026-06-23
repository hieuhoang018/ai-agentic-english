'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback } from 'react';

import { apiFetch, type ApiRequestOptions } from './client';

export function useApi() {
  const { getToken } = useAuth();

  return useCallback(
    async function authenticatedApiFetch<TResponse>(
      path: string,
      options: ApiRequestOptions = {},
    ): Promise<TResponse> {
      const token = await getToken();
      return apiFetch<TResponse>(path, { ...options, token });
    },
    [getToken],
  );
}

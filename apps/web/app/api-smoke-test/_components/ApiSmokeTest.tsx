'use client';

import { useCallback, useEffect, useState } from 'react';

import { isApiError } from '@/lib/api/client';
import { type UserDto } from '@/lib/api/types';
import { useApi } from '@/lib/api/useApi';

type SmokeTestState =
  | { status: 'loading' }
  | { status: 'success'; user: UserDto }
  | { status: 'error'; message: string };

export default function ApiSmokeTest() {
  const api = useApi();
  const [state, setState] = useState<SmokeTestState>({ status: 'loading' });

  const loadUser = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      const user = await api<UserDto>('/users/me');
      setState({ status: 'success', user });
    } catch (error) {
      setState({
        status: 'error',
        message: isApiError(error) ? error.message : 'Unable to reach the API.',
      });
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialUser() {
      try {
        const user = await api<UserDto>('/users/me');
        if (!cancelled) setState({ status: 'success', user });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: isApiError(error) ? error.message : 'Unable to reach the API.',
          });
        }
      }
    }

    void loadInitialUser();
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (state.status === 'loading') {
    return <p>Loading current user from the API…</p>;
  }

  if (state.status === 'error') {
    return (
      <div>
        <p role="alert">{state.message}</p>
        <button onClick={() => void loadUser()} type="button">
          Retry
        </button>
      </div>
    );
  }

  return <pre>{JSON.stringify(state.user, null, 2)}</pre>;
}

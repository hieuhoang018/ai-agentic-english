import { InitializeProgressInput, ProgressDto, getEnv } from '@ai-agentic-english/shared';

export interface MemoryProgressClient {
  initializeProgress(userId: string, input: InitializeProgressInput): Promise<ProgressDto>;
}

export function createMemoryProgressClient(): MemoryProgressClient {
  const baseUrl = getEnv('MEMORY_PROGRESS_SERVICE_URL', 'http://localhost:4003');
  const internalSecret = getEnv('INTERNAL_SECRET', 'dev-internal-secret');

  return {
    async initializeProgress(userId: string, input: InitializeProgressInput): Promise<ProgressDto> {
      const res = await fetch(`${baseUrl}/internal/progress/${userId}/initialize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`Memory & Progress request failed: ${res.status}`);
      return (await res.json()) as ProgressDto;
    },
  };
}

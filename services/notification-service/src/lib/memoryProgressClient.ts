import { ReminderContextDto, getEnv } from '@ai-agentic-english/shared';

export interface MemoryProgressClient {
  getReminderContext(userId: string): Promise<ReminderContextDto>;
}

export function createMemoryProgressClient(): MemoryProgressClient {
  const baseUrl = getEnv('MEMORY_PROGRESS_SERVICE_URL', 'http://localhost:4003');
  const internalSecret = getEnv('INTERNAL_SECRET', 'dev-internal-secret');

  return {
    async getReminderContext(userId: string): Promise<ReminderContextDto> {
      const res = await fetch(`${baseUrl}/internal/reminders/${userId}/context`, {
        headers: { 'x-internal-secret': internalSecret },
      });

      if (!res.ok) {
        throw new Error(`Memory & Progress Service request failed: ${res.status}`);
      }

      return (await res.json()) as ReminderContextDto;
    },
  };
}

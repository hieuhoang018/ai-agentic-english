import { ReminderContextDto, getEnv } from '@ai-agentic-english/shared';

export interface ReminderContextClient {
  getReminderContext(userId: string): Promise<ReminderContextDto>;
}

/**
 * Placeholder until the AI engineer publishes the agents-stack endpoint that replaces
 * memory-progress-service's GET /internal/reminders/:userId/context (see
 * docs/agents-integration-plan.md §5a). Same ReminderContextDto shape is expected — only
 * AGENTS_REMINDER_CONTEXT_URL needs to change once that endpoint exists.
 */
export function createReminderContextClient(): ReminderContextClient {
  const baseUrl = getEnv('AGENTS_REMINDER_CONTEXT_URL', 'http://localhost:4106');
  const internalSecret = getEnv('INTERNAL_SECRET', 'dev-internal-secret');

  return {
    async getReminderContext(userId: string): Promise<ReminderContextDto> {
      const res = await fetch(`${baseUrl}/internal/reminders/${userId}/context`, {
        headers: { 'x-internal-secret': internalSecret },
      });

      if (!res.ok) {
        throw new Error(`Reminder context request failed: ${res.status}`);
      }

      return (await res.json()) as ReminderContextDto;
    },
  };
}

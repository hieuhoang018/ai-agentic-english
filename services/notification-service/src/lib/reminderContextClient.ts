import { ReminderContextDto, createInternalHttpClient, getEnv } from '@ai-agentic-english/shared';

export interface ReminderContextClient {
  getReminderContext(userId: string): Promise<ReminderContextDto>;
}

export function createReminderContextClient(): ReminderContextClient {
  const http = createInternalHttpClient(
    getEnv('AGENTS_REMINDER_CONTEXT_URL', 'http://localhost:4106'),
    getEnv('INTERNAL_SECRET', 'dev-internal-secret'),
  );

  return {
    async getReminderContext(userId: string): Promise<ReminderContextDto> {
      const { body, status } = await http.get<ReminderContextDto>(`/internal/reminders/${userId}/context`);
      if (!body) throw new Error(`Reminder context request failed: ${status}`);
      return body;
    },
  };
}

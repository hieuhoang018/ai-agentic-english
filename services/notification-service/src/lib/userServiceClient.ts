import { UserSummaryDto, createInternalHttpClient, getEnv } from '@ai-agentic-english/shared';

export interface UserServiceClient {
  listUsers(): Promise<UserSummaryDto[]>;
}

export function createUserServiceClient(): UserServiceClient {
  const http = createInternalHttpClient(
    getEnv('USER_SERVICE_URL', 'http://localhost:4001'),
    getEnv('INTERNAL_SECRET', 'dev-internal-secret'),
  );

  return {
    async listUsers(): Promise<UserSummaryDto[]> {
      const { body, status } = await http.get<UserSummaryDto[]>('/internal/users');
      if (!body) throw new Error(`User Service request failed: ${status}`);
      return body;
    },
  };
}

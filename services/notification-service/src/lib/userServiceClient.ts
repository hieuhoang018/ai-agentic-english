import { UserSummaryDto, getEnv } from '@ai-agentic-english/shared';

export interface UserServiceClient {
  listUsers(): Promise<UserSummaryDto[]>;
}

export function createUserServiceClient(): UserServiceClient {
  const baseUrl = getEnv('USER_SERVICE_URL', 'http://localhost:4001');
  const internalSecret = getEnv('INTERNAL_SECRET', 'dev-internal-secret');

  return {
    async listUsers(): Promise<UserSummaryDto[]> {
      const res = await fetch(`${baseUrl}/internal/users`, {
        headers: { 'x-internal-secret': internalSecret },
      });

      if (!res.ok) {
        throw new Error(`User Service request failed: ${res.status}`);
      }

      return (await res.json()) as UserSummaryDto[];
    },
  };
}

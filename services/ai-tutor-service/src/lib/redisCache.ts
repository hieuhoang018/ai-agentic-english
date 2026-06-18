import { getEnv } from '@ai-agentic-english/shared';
import { createClient } from 'redis';

export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export function createRedisCacheClient(): CacheClient {
  const url = getEnv('REDIS_URL', 'redis://localhost:6379');
  const client = createClient({ url });
  let connecting: Promise<unknown> | null = null;

  function ensureConnected() {
    if (!client.isOpen) {
      connecting ??= client.connect();
      return connecting;
    }
    return Promise.resolve();
  }

  return {
    async get(key: string): Promise<string | null> {
      await ensureConnected();
      return client.get(key);
    },
    async set(key: string, value: string, ttlSeconds: number): Promise<void> {
      await ensureConnected();
      await client.set(key, value, { EX: ttlSeconds });
    },
  };
}

// In-memory stand-in for tests — mirrors InMemoryEventBus's role for EventBus.
export function createInMemoryCacheClient(): CacheClient {
  const store = new Map<string, string>();
  return {
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
  };
}

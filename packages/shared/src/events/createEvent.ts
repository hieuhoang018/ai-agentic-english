import { randomUUID } from 'crypto';
import type { BaseEvent } from './base';

export function createEvent<T extends BaseEvent>(
  fields: Omit<T, 'eventId' | 'schemaVersion' | 'occurredAt'>,
): T {
  return {
    eventId: randomUUID(),
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    ...fields,
  } as T;
}

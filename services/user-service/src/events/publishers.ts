import { USER_UPSERTED_TOPIC, UserUpsertedEvent } from '@ai-agentic-english/shared';
import type { EventBus } from '@ai-agentic-english/shared';
import { randomUUID } from 'crypto';

export interface UserSyncedPayload {
  userId: string;
  clerkUserId: string;
  email: string;
}

export const USER_EVENTS_TOPIC = 'user-events';

export function publishUserCreated(eventBus: EventBus, payload: UserSyncedPayload) {
  return eventBus.publish(
    USER_EVENTS_TOPIC,
    { type: 'user.created', occurredAt: new Date().toISOString(), payload },
    payload.userId,
  );
}

export function publishUserUpdated(eventBus: EventBus, payload: UserSyncedPayload) {
  return eventBus.publish(
    USER_EVENTS_TOPIC,
    { type: 'user.updated', occurredAt: new Date().toISOString(), payload },
    payload.userId,
  );
}

export function publishUserUpserted(
  eventBus: EventBus,
  payload: { clerkUserId: string; email: string; name?: string; action: 'created' | 'updated' },
) {
  const event: UserUpsertedEvent = {
    eventId: randomUUID(),
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    type: 'user.upserted',
    userId: payload.clerkUserId,
    email: payload.email,
    name: payload.name,
    action: payload.action,
  };
  return eventBus.publish(USER_UPSERTED_TOPIC, { type: event.type, occurredAt: event.occurredAt, payload: event }, payload.clerkUserId);
}

export function publishUserDeleted(eventBus: EventBus, payload: { clerkUserId: string }) {
  return eventBus.publish(
    USER_EVENTS_TOPIC,
    { type: 'user.deleted', occurredAt: new Date().toISOString(), payload },
    payload.clerkUserId,
  );
}

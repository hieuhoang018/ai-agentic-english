import {
  USER_DELETED_TOPIC,
  USER_UPSERTED_TOPIC,
  UserDeletedEvent,
  UserUpsertedEvent,
  createEvent,
} from '@ai-agentic-english/shared';
import type { EventBus } from '@ai-agentic-english/shared';

export function publishUserUpserted(
  eventBus: EventBus,
  payload: { clerkUserId: string; email: string; name?: string; action: 'created' | 'updated' },
) {
  const event = createEvent<UserUpsertedEvent>({
    type: 'user.upserted',
    userId: payload.clerkUserId,
    email: payload.email,
    name: payload.name,
    action: payload.action,
  });
  return eventBus.publish(USER_UPSERTED_TOPIC, { type: event.type, occurredAt: event.occurredAt, payload: event }, payload.clerkUserId);
}

export function publishUserDeleted(eventBus: EventBus, payload: { clerkUserId: string }) {
  const event = createEvent<UserDeletedEvent>({
    type: 'user.deleted',
    userId: payload.clerkUserId,
  });
  return eventBus.publish(USER_DELETED_TOPIC, { type: event.type, occurredAt: event.occurredAt, payload: event }, payload.clerkUserId);
}

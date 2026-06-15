import type { EventBus } from "@ai-agentic-english/shared"

export interface UserSyncedPayload {
  userId: string
  clerkUserId: string
  email: string
}

export const USER_EVENTS_TOPIC = "user-events"

export function publishUserCreated(
  eventBus: EventBus,
  payload: UserSyncedPayload,
) {
  return eventBus.publish(
    USER_EVENTS_TOPIC,
    { type: "user.created", occurredAt: new Date().toISOString(), payload },
    payload.userId,
  )
}

export function publishUserDeleted(
  eventBus: EventBus,
  payload: { clerkUserId: string },
) {
  return eventBus.publish(
    USER_EVENTS_TOPIC,
    { type: "user.deleted", occurredAt: new Date().toISOString(), payload },
    payload.clerkUserId,
  )
}

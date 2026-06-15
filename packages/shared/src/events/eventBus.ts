export interface DomainEvent<TPayload = unknown> {
  type: string;
  occurredAt: string;
  payload: TPayload;
}

export interface EventBus {
  publish(topic: string, event: DomainEvent, key?: string): Promise<void>;
}

/** Records published events in memory instead of sending them anywhere. Useful for tests and Phase 1 stubs. */
export class InMemoryEventBus implements EventBus {
  readonly published: { topic: string; event: DomainEvent; key?: string }[] = [];

  async publish(topic: string, event: DomainEvent, key?: string): Promise<void> {
    this.published.push({ topic, event, key });
  }
}

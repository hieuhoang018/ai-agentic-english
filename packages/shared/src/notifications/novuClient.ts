export interface NovuSubscriberPayload {
  subscriberId: string;
  email: string;
  name?: string;
  timezone?: string;
}

export interface NovuTriggerPayload {
  workflowId: string;
  subscriberId: string;
  payload?: Record<string, unknown>;
}

export interface NovuClient {
  upsertSubscriber(subscriber: NovuSubscriberPayload): Promise<void>;
  triggerNotification(trigger: NovuTriggerPayload): Promise<void>;
}

/** Records calls in memory instead of calling Novu. Default runtime implementation until a real NOVU_API_KEY is wired up. */
export class MockNovuClient implements NovuClient {
  readonly upsertedSubscribers: NovuSubscriberPayload[] = [];
  readonly triggeredNotifications: NovuTriggerPayload[] = [];

  async upsertSubscriber(subscriber: NovuSubscriberPayload): Promise<void> {
    this.upsertedSubscribers.push(subscriber);
  }

  async triggerNotification(trigger: NovuTriggerPayload): Promise<void> {
    this.triggeredNotifications.push(trigger);
  }
}

import { NovuClient, NovuSubscriberPayload, NovuTriggerPayload } from '@ai-agentic-english/shared';
import { Novu } from '@novu/api';

export function createLiveNovuClient(secretKey: string): NovuClient {
  const novu = new Novu({ secretKey });

  return {
    async upsertSubscriber(subscriber: NovuSubscriberPayload): Promise<void> {
      // create() upserts by default (failIfExists is false unless passed) — updates the
      // subscriber in place if subscriberId already exists, per the SDK's own doc comment.
      await novu.subscribers.create({
        subscriberId: subscriber.subscriberId,
        email: subscriber.email,
        firstName: subscriber.name,
        timezone: subscriber.timezone,
      });
    },

    async triggerNotification(trigger: NovuTriggerPayload): Promise<void> {
      await novu.trigger({
        workflowId: trigger.workflowId,
        to: trigger.subscriberId,
        payload: trigger.payload ?? {},
      });
    },
  };
}

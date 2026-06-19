import { BaseEvent } from './base';

export const USER_UPSERTED_TOPIC = 'user.upserted';

export interface UserUpsertedEvent extends BaseEvent {
  type: 'user.upserted';
  userId: string;
  email: string;
  name?: string;
  action: 'created' | 'updated';
}

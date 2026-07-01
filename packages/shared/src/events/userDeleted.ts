import { BaseEvent } from './base';

export const USER_DELETED_TOPIC = 'user.deleted';

export interface UserDeletedEvent extends BaseEvent {
  type: 'user.deleted';
  userId: string;
}

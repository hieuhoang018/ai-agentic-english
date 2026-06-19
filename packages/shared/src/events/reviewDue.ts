import { BaseEvent } from './base';

export const REVIEW_DUE_TOPIC = 'review.due';

export interface ReviewDueEvent extends BaseEvent {
  type: 'review.due';
  userId: string;
  dueCount: number;
  itemTypes: string[];
}

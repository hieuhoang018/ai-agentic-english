import { BaseEvent } from './base';

export const LEARNING_PATH_READY_TOPIC = 'learning-path.ready';

export interface LearningPathReadyEvent extends BaseEvent {
  type: 'learning-path.ready';
  userId: string;
  pathId: string;
}

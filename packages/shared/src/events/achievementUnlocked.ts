import { BaseEvent } from './base';

export const ACHIEVEMENT_UNLOCKED_TOPIC = 'achievement.unlocked';

export type AchievementType = 'first-lesson' | '7-day-streak' | 'level-up';

export interface AchievementUnlockedEvent extends BaseEvent {
  type: 'achievement.unlocked';
  userId: string;
  achievementType: AchievementType;
  metadata?: unknown;
}

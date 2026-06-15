import { UserId } from '../auth/extractUserId';

export interface UserSettingsDto {
  dailyTimeBudgetMinutes: number;
  preferredLanguage: string;
  reminderTime: string | null;
  timezone: string;
  notificationChannelHints: Record<string, unknown>;
}

export interface UserDto {
  id: string;
  clerkUserId: UserId;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  settings: UserSettingsDto;
}

export interface UpdateUserSettingsDto {
  dailyTimeBudgetMinutes?: number;
  preferredLanguage?: string;
  reminderTime?: string | null;
  timezone?: string;
  notificationChannelHints?: Record<string, unknown>;
}

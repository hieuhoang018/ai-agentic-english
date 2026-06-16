import { UserDto, UserSettingsDto } from '@ai-agentic-english/shared';
import { User, UserSettings } from '../../prisma/generated/client';

export function toUserSettingsDto(settings: UserSettings): UserSettingsDto {
  return {
    dailyTimeBudgetMinutes: settings.dailyTimeBudgetMinutes,
    preferredLanguage: settings.preferredLanguage,
    reminderTime: settings.reminderTime,
    timezone: settings.timezone,
    notificationChannelHints: settings.notificationChannelHints as Record<string, unknown>,
  };
}

export function toUserDto(user: User & { settings: UserSettings }): UserDto {
  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    settings: toUserSettingsDto(user.settings),
  };
}

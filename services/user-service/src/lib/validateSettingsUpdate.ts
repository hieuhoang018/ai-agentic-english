import { ValidationError } from '@ai-agentic-english/shared';
import { Prisma } from '../../prisma/generated/client';

export interface SettingsUpdateData {
  dailyTimeBudgetMinutes?: number;
  preferredLanguage?: string;
  reminderTime?: string | null;
  timezone?: string;
  notificationChannelHints?: Prisma.InputJsonValue;
}

export function validateSettingsUpdate(body: unknown): SettingsUpdateData {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Request body must be an object');
  }

  const input = body as Record<string, unknown>;
  const update: SettingsUpdateData = {};

  if ('dailyTimeBudgetMinutes' in input) {
    const value = input.dailyTimeBudgetMinutes;
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new ValidationError('dailyTimeBudgetMinutes must be a positive integer');
    }
    update.dailyTimeBudgetMinutes = value;
  }

  if ('preferredLanguage' in input) {
    const value = input.preferredLanguage;
    if (typeof value !== 'string' || value.length === 0) {
      throw new ValidationError('preferredLanguage must be a non-empty string');
    }
    update.preferredLanguage = value;
  }

  if ('reminderTime' in input) {
    const value = input.reminderTime;
    if (value !== null) {
      if (typeof value !== 'string') {
        throw new ValidationError('reminderTime must be a "HH:MM" string or null');
      }
      const match = /^(\d{2}):(\d{2})$/.exec(value);
      if (!match) {
        throw new ValidationError('reminderTime must be a "HH:MM" string or null');
      }
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours > 23 || minutes > 59) {
        throw new ValidationError('reminderTime must be a valid 24h time (00:00-23:59) or null');
      }
    }
    update.reminderTime = value as string | null;
  }

  if ('timezone' in input) {
    const value = input.timezone;
    if (typeof value !== 'string' || value.length === 0) {
      throw new ValidationError('timezone must be a non-empty string');
    }
    update.timezone = value;
  }

  if ('notificationChannelHints' in input) {
    const value = input.notificationChannelHints;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ValidationError('notificationChannelHints must be an object');
    }
    update.notificationChannelHints = value as Prisma.InputJsonValue;
  }

  if (Object.keys(update).length === 0) {
    throw new ValidationError('No valid settings fields provided');
  }

  return update;
}

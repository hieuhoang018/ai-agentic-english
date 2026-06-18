import { CreateLearnerModelInput, ValidationError } from '@ai-agentic-english/shared';
import { Prisma } from '../../prisma/generated/client';
import { LearnerModel } from '../../prisma/generated/client';
import { AppPrismaClient } from './prisma';

export async function upsertLearnerModel(
  prisma: AppPrismaClient,
  input: CreateLearnerModelInput,
): Promise<LearnerModel> {
  const { userId, currentLevel, dailyTimeBudgetMinutes, goals, weakAreas } = input;

  if (!userId || typeof userId !== 'string') {
    throw new ValidationError('userId is required');
  }
  if (!currentLevel || typeof currentLevel !== 'object') {
    throw new ValidationError('currentLevel is required');
  }
  if (typeof dailyTimeBudgetMinutes !== 'number' || dailyTimeBudgetMinutes <= 0) {
    throw new ValidationError('dailyTimeBudgetMinutes must be a positive number');
  }
  if (!Array.isArray(goals)) {
    throw new ValidationError('goals is required');
  }

  const data = {
    currentLevel: currentLevel as Prisma.InputJsonValue,
    dailyTimeBudgetMinutes,
    goals: goals as Prisma.InputJsonValue,
    weakAreas: (weakAreas ?? []) as Prisma.InputJsonValue,
  };

  return prisma.learnerModel.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

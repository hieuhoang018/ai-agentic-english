import {
  ACHIEVEMENT_UNLOCKED_TOPIC,
  AchievementUnlockedEvent,
  LEARNING_PATH_READY_TOPIC,
  LearningPathReadyEvent,
  NovuClient,
  REVIEW_DUE_TOPIC,
  ReviewDueEvent,
  USER_UPSERTED_TOPIC,
  UserUpsertedEvent,
  createKafkaConsumer,
  getEnv,
} from '@ai-agentic-english/shared';
import { AppPrismaClient } from '../lib/prisma';
import { handleAchievementUnlocked } from './consumers/achievementUnlocked';
import { handleLearningPathReady } from './consumers/learningPathReady';
import { handleReviewDue } from './consumers/reviewDue';
import { handleUserUpserted } from './consumers/userUpserted';

export function startNotificationConsumer(prisma: AppPrismaClient, novuClient: NovuClient) {
  const brokers = getEnv('KAFKA_BROKERS', 'localhost:9092').split(',');
  const consumer = createKafkaConsumer({
    brokers,
    groupId: 'notification-service',
    topics: [USER_UPSERTED_TOPIC, LEARNING_PATH_READY_TOPIC, ACHIEVEMENT_UNLOCKED_TOPIC, REVIEW_DUE_TOPIC],
    onMessage: async (topic, event) => {
      switch (topic) {
        case USER_UPSERTED_TOPIC:
          return handleUserUpserted(prisma, novuClient, event.payload as UserUpsertedEvent);
        case LEARNING_PATH_READY_TOPIC:
          return handleLearningPathReady(prisma, novuClient, event.payload as LearningPathReadyEvent);
        case ACHIEVEMENT_UNLOCKED_TOPIC:
          return handleAchievementUnlocked(prisma, novuClient, event.payload as AchievementUnlockedEvent);
        case REVIEW_DUE_TOPIC:
          return handleReviewDue(prisma, novuClient, event.payload as ReviewDueEvent);
        default:
          return undefined;
      }
    },
  });

  return consumer.start();
}

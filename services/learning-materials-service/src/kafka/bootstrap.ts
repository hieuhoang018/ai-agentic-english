import { USER_DELETED_TOPIC, UserDeletedEvent, createKafkaConsumer, getEnv } from '@ai-agentic-english/shared';
import { AppPrismaClient } from '../lib/prisma';
import { handleUserDeleted } from './consumers/userDeleted';

export function startLearningMaterialsConsumer(prisma: AppPrismaClient) {
  const brokers = getEnv('KAFKA_BROKERS', 'localhost:9092').split(',');
  const consumer = createKafkaConsumer({
    brokers,
    groupId: 'learning-materials-service',
    topics: [USER_DELETED_TOPIC],
    onMessage: async (topic, event) => {
      switch (topic) {
        case USER_DELETED_TOPIC:
          return handleUserDeleted(prisma, event.payload as UserDeletedEvent);
        default:
          return undefined;
      }
    },
  });

  return consumer.start();
}

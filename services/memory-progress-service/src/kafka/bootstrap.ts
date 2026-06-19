import { AttemptRecordedEvent, EventBus, createKafkaConsumer, getEnv } from '@ai-agentic-english/shared';
import { LearningMaterialsClient } from '../lib/learningMaterialsClient';
import { AppPrismaClient } from '../lib/prisma';
import { consumeAttemptRecorded } from './consumers/attemptRecorded';

const ATTEMPT_RECORDED_TOPIC = 'attempt.recorded';

export function startAttemptRecordedConsumer(
  prisma: AppPrismaClient,
  learningMaterials: LearningMaterialsClient,
  eventBus: EventBus,
) {
  const brokers = getEnv('KAFKA_BROKERS', 'localhost:9092').split(',');
  const consumer = createKafkaConsumer({
    brokers,
    groupId: 'memory-progress-service',
    topics: [ATTEMPT_RECORDED_TOPIC],
    onMessage: async (_topic, event) => {
      await consumeAttemptRecorded(prisma, event.payload as AttemptRecordedEvent, learningMaterials, eventBus);
    },
  });

  return consumer.start();
}

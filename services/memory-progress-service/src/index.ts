import { createKafkaEventBus, getEnv } from '@ai-agentic-english/shared';
import { createApp } from './app';
import { startAttemptRecordedConsumer } from './kafka/bootstrap';
import { createLearningMaterialsClient } from './lib/learningMaterialsClient';
import { PrismaClient } from '../prisma/generated/client';

const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
const port = Number.isFinite(parsedPort) ? parsedPort : 4003;
const app = createApp();

app.listen(port, () => {
  console.log(`memory-progress-service listening on port ${port}`);
});

const prisma = new PrismaClient();
const learningMaterials = createLearningMaterialsClient();
const eventBus = createKafkaEventBus(getEnv('KAFKA_BROKERS', 'localhost:9092').split(','));

startAttemptRecordedConsumer(prisma, learningMaterials, eventBus).catch((error) => {
  console.error('Failed to start attempt.recorded consumer', error);
});

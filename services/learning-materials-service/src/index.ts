import { getEnvInt } from '@ai-agentic-english/shared';
import { PrismaClient } from '../prisma/generated/client';
import { createApp } from './app';
import { startLearningMaterialsConsumer } from './kafka/bootstrap';

const port = getEnvInt('PORT', 4002);
const app = createApp();

app.listen(port, () => {
  console.log(`learning-materials-service listening on port ${port}`);
});

const prisma = new PrismaClient();

startLearningMaterialsConsumer(prisma).catch((error) => {
  console.error('Failed to start learning-materials-service Kafka consumer', error);
});

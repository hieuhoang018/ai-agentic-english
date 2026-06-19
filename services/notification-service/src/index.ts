import { MockNovuClient, NovuClient } from '@ai-agentic-english/shared';
import cron from 'node-cron';
import { PrismaClient } from '../prisma/generated/client';
import { createApp } from './app';
import { startNotificationConsumer } from './kafka/bootstrap';
import { createMemoryProgressClient } from './lib/memoryProgressClient';
import { createLiveNovuClient } from './lib/novuClient';
import { createUserServiceClient } from './lib/userServiceClient';
import { runDailyReminder } from './scheduler/dailyReminder';
import { runVocabOfTheDay } from './scheduler/vocabOfTheDay';

const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
const port = Number.isFinite(parsedPort) ? parsedPort : 4005;
const app = createApp();

app.listen(port, () => {
  console.log(`notification-service listening on port ${port}`);
});

const prisma = new PrismaClient();
// Same swappable pattern as INFERENCE_MODE: real client when NOVU_API_KEY is set, mock otherwise.
const novuClient: NovuClient = process.env.NOVU_API_KEY ? createLiveNovuClient(process.env.NOVU_API_KEY) : new MockNovuClient();
const userServiceClient = createUserServiceClient();
const memoryProgressClient = createMemoryProgressClient();

startNotificationConsumer(prisma, novuClient).catch((error) => {
  console.error('Failed to start notification Kafka consumer', error);
});

cron.schedule('0 * * * *', () => {
  const now = new Date();
  runDailyReminder(now, prisma, userServiceClient, memoryProgressClient, novuClient).catch((error) => {
    console.error('Daily reminder job failed', error);
  });
  runVocabOfTheDay(now, prisma, userServiceClient, memoryProgressClient, novuClient).catch((error) => {
    console.error('Vocab of the day job failed', error);
  });
});

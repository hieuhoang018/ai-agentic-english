import { getEnvInt, MockNovuClient, NovuClient } from '@ai-agentic-english/shared';
import cron from 'node-cron';
import { PrismaClient } from '../prisma/generated/client';
import { createApp } from './app';
import { startNotificationConsumer } from './kafka/bootstrap';
import { createReminderContextClient } from './lib/reminderContextClient';
import { createLiveNovuClient } from './lib/novuClient';
import { createUserServiceClient } from './lib/userServiceClient';
import { runDailyReminder } from './scheduler/dailyReminder';
import { runVocabOfTheDay } from './scheduler/vocabOfTheDay';

const port = getEnvInt('PORT', 4005);
const app = createApp();

app.listen(port, () => {
  console.log(`notification-service listening on port ${port}`);
});

const prisma = new PrismaClient();
// Real client when NOVU_API_KEY is set, mock otherwise.
const novuClient: NovuClient = process.env.NOVU_API_KEY ? createLiveNovuClient(process.env.NOVU_API_KEY) : new MockNovuClient();
const userServiceClient = createUserServiceClient();
const reminderContextClient = createReminderContextClient();

startNotificationConsumer(prisma, novuClient).catch((error) => {
  console.error('Failed to start notification Kafka consumer', error);
});

cron.schedule('0 * * * *', () => {
  const now = new Date();
  runDailyReminder(now, prisma, userServiceClient, reminderContextClient, novuClient).catch((error) => {
    console.error('Daily reminder job failed', error);
  });
  runVocabOfTheDay(now, prisma, userServiceClient, reminderContextClient, novuClient).catch((error) => {
    console.error('Vocab of the day job failed', error);
  });
});

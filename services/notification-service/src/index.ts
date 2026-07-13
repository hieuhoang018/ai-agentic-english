import { getEnvInt, MockNovuClient, NovuClient } from '@ai-agentic-english/shared';
import cron from 'node-cron';
import { PrismaClient } from '../prisma/generated/client';
import { createApp } from './app';
import { startNotificationConsumer } from './kafka/bootstrap';
import { createReminderContextClient } from './lib/reminderContextClient';
import { createLiveNovuClient } from './lib/novuClient';
import { createUserServiceClient } from './lib/userServiceClient';
import { createLiveWebPushSender, MockWebPushSender, WebPushSender } from './lib/webPush';
import { runDailyReminder } from './scheduler/dailyReminder';
import { runVocabOfTheDay } from './scheduler/vocabOfTheDay';

const port = getEnvInt('PORT', 4005);

const prisma = new PrismaClient();
const app = createApp(prisma);

// Real client when NOVU_API_KEY is set, mock otherwise.
const novuClient: NovuClient = process.env.NOVU_API_KEY ? createLiveNovuClient(process.env.NOVU_API_KEY) : new MockNovuClient();

// Real sender when all three VAPID vars are set, mock otherwise — same
// pattern as NOVU_API_KEY above.
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
const webPushSender: WebPushSender =
  VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT
    ? createLiveWebPushSender(prisma, {
        publicKey: VAPID_PUBLIC_KEY,
        privateKey: VAPID_PRIVATE_KEY,
        subject: VAPID_SUBJECT,
      })
    : new MockWebPushSender();

const userServiceClient = createUserServiceClient();
const reminderContextClient = createReminderContextClient();

app.listen(port, () => {
  console.log(`notification-service listening on port ${port}`);
});

startNotificationConsumer(prisma, novuClient, webPushSender).catch((error) => {
  console.error('Failed to start notification Kafka consumer', error);
});

cron.schedule('0 * * * *', () => {
  const now = new Date();
  runDailyReminder(now, prisma, userServiceClient, reminderContextClient, novuClient, webPushSender).catch((error) => {
    console.error('Daily reminder job failed', error);
  });
  runVocabOfTheDay(now, prisma, userServiceClient, reminderContextClient, novuClient, webPushSender).catch((error) => {
    console.error('Vocab of the day job failed', error);
  });
});

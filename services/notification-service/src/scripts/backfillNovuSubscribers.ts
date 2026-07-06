/**
 * One-off backfill: the user.upserted Kafka consumer only syncs Novu
 * subscribers going forward, so any user created before NOVU_API_KEY went
 * live never got a novu.subscribers.create call. Run this once after
 * enabling a real Novu account. Safe to re-run — upsertSubscriber is
 * idempotent per subscriberId.
 *
 * Usage: npm run backfill:novu-subscribers -w @ai-agentic-english/notification-service
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NovuClient } from '@ai-agentic-english/shared';
import { createLiveNovuClient } from '../lib/novuClient';
import { createUserServiceClient } from '../lib/userServiceClient';

function loadEnvFile(path: string): void {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf-8');
  } catch {
    return;
  }
  for (const line of contents.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2];
    }
  }
}

async function main(): Promise<void> {
  loadEnvFile(resolve(__dirname, '../../.env'));

  if (!process.env.NOVU_API_KEY) {
    console.error('NOVU_API_KEY is not set — refusing to backfill against a mock client.');
    process.exitCode = 1;
    return;
  }

  const novuClient: NovuClient = createLiveNovuClient(process.env.NOVU_API_KEY);
  const userServiceClient = createUserServiceClient();

  const users = await userServiceClient.listUsers();
  console.log(`Backfilling ${users.length} user(s) into Novu...`);

  let succeeded = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await novuClient.upsertSubscriber({ subscriberId: user.clerkUserId, email: user.email, name: user.name ?? undefined });
      succeeded += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed to upsert subscriber ${user.clerkUserId}:`, error);
    }
  }

  console.log(`Done. ${succeeded} succeeded, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main();

import { AppPrismaClient } from '../lib/prisma';

/** At-least-once Kafka delivery dedup: skip the handler if this eventId was already processed. */
export async function withDedup(prisma: AppPrismaClient, eventId: string, handler: () => Promise<void>): Promise<void> {
  const existing = await prisma.processedEvent.findUnique({ where: { eventId } });
  if (existing) return;

  await handler();
  await prisma.processedEvent.create({ data: { eventId } });
}

import { describe, expect, it } from 'vitest';
import { createEvent } from '../events/createEvent';
import type { LearningPathReadyEvent } from '../events/learningPathReady';
import type { UserUpsertedEvent } from '../events/userUpserted';

describe('createEvent', () => {
  it('fills eventId (UUID v4 format), schemaVersion=1, and a valid ISO occurredAt', () => {
    const before = Date.now();
    const event = createEvent<UserUpsertedEvent>({
      type: 'user.upserted',
      userId: 'user_123',
      email: 'u@test.com',
      action: 'created',
    });
    const after = Date.now();

    expect(event.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(event.schemaVersion).toBe(1);
    const ts = new Date(event.occurredAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('passes through all domain fields unchanged', () => {
    const event = createEvent<LearningPathReadyEvent>({
      type: 'learning-path.ready',
      userId: 'u_abc',
      pathId: 'path_xyz',
    });

    expect(event.type).toBe('learning-path.ready');
    expect(event.userId).toBe('u_abc');
    expect(event.pathId).toBe('path_xyz');
  });

  it('generates a unique eventId on each call', () => {
    const e1 = createEvent<LearningPathReadyEvent>({ type: 'learning-path.ready', userId: 'u', pathId: 'p' });
    const e2 = createEvent<LearningPathReadyEvent>({ type: 'learning-path.ready', userId: 'u', pathId: 'p' });

    expect(e1.eventId).not.toBe(e2.eventId);
  });
});

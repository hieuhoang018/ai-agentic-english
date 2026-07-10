import type { OfflineReview, OfflineSyncResult } from '../api/types';
import { openOfflineDb, type PendingReviewRecord } from './db';

// Shared with app/sw.ts's `sync` event listener — keep the string in one
// place so the registration side and the handler side can't drift apart.
export const BACKGROUND_SYNC_TAG = 'sync-offline-reviews';

// Background Sync isn't in TS's default lib.dom.d.ts (still not universally
// standardized) — declare just enough of the shape we use rather than pull in
// a whole third-party lib.
interface SyncManager {
  register(tag: string): Promise<void>;
}

async function registerBackgroundSync() {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
  // `serviceWorker.ready` never resolves unless a worker is already
  // controlling this page — it hangs indefinitely (not just "slow") whenever
  // no SW is active, e.g. under `next dev`, where registration is
  // deliberately disabled (see docs/pwa-implementation-plan.md). Guard on
  // `controller` first so this is a genuine no-op in that case instead of an
  // indefinite hang.
  if (!navigator.serviceWorker.controller) return;

  try {
    const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync: SyncManager;
    };
    await registration.sync.register(BACKGROUND_SYNC_TAG);
  } catch {
    // Best-effort — the foreground online-event fallback (Stage 3) and the
    // best-effort flush triggered right after queueReview still cover this.
  }
}

// Writes a rating locally first (optimistic) so the UI can advance
// immediately regardless of network state. review_id is generated here, not
// at sync time, so a retried flush of the same row can never double-submit.
export async function queueReview(item_id: string, quality: number): Promise<PendingReviewRecord> {
  const record: PendingReviewRecord = {
    review_id: crypto.randomUUID(),
    item_id,
    quality,
    reviewed_at: new Date().toISOString(),
  };

  const db = await openOfflineDb();
  await db.put('pendingReviews', record);
  // Fire-and-forget — this must never block the optimistic write above, even
  // if a future browser/edge case makes it slower than expected.
  void registerBackgroundSync();

  return record;
}

// Posts every queued review in one batch and deletes the rows the backend
// confirmed handling. AGT-07's sync endpoint only ever returns per-review
// failures for validation errors (missing fields, unknown item), never
// silent partial drops — so anything not in `errors` is safe to delete.
export async function flushPendingReviews(): Promise<OfflineSyncResult | null> {
  const db = await openOfflineDb();
  const pending = await db.getAll('pendingReviews');
  if (pending.length === 0) return null;

  const reviews: OfflineReview[] = pending.map(({ review_id, item_id, quality, reviewed_at }) => ({
    review_id,
    item_id,
    quality,
    reviewed_at,
  }));

  const res = await fetch('/api/offline/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviews }),
  });
  if (!res.ok) throw new Error(`Request failed with ${res.status}`);
  const result = (await res.json()) as OfflineSyncResult;

  const failedReviewIds = new Set(
    result.errors.map((error) => error.review_id).filter((id): id is string => Boolean(id)),
  );
  const tx = db.transaction('pendingReviews', 'readwrite');
  await Promise.all(
    pending
      .filter((review) => !failedReviewIds.has(review.review_id))
      .map((review) => tx.store.delete(review.review_id)),
  );
  await tx.done;

  return result;
}

// Safari has zero support for the Background Sync API (desktop or iOS) — this
// is the baseline every browser gets, not a lesser fallback bolted on after
// the fact. Covers both cases Background Sync can't: the app being reopened
// while already online (no 'online' transition fires on page load), and —
// for browsers without SyncManager at all — coming back online while the tab
// stays open. Returns an unsubscribe function; call once from a
// globally-mounted component, not per-page, so a queued rating still flushes
// even if the user navigated away before reconnecting.
export function watchForOnlineFlush(): () => void {
  if (typeof window === 'undefined') return () => {};

  const flush = () => {
    flushPendingReviews().catch(() => {});
  };

  if (navigator.onLine) flush();

  window.addEventListener('online', flush);
  return () => window.removeEventListener('online', flush);
}

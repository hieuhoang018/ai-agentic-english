import type { OfflinePackage } from '../api/types';
import { openOfflineDb, type DueCardRecord } from './db';

export async function readDueCardsFromIndexedDb(): Promise<DueCardRecord[]> {
  const db = await openOfflineDb();
  return db.getAll('dueCards');
}

// Fetches the latest offline package and replaces `dueCards` wholesale — the
// package endpoint is already a point-in-time snapshot, so there's nothing to
// diff/merge, each successful fetch is authoritative.
export async function syncPackageToIndexedDb(): Promise<DueCardRecord[]> {
  const res = await fetch('/api/offline/package');
  if (!res.ok) throw new Error(`Request failed with ${res.status}`);
  const pkg = (await res.json()) as OfflinePackage;

  const sm2ByVocabId = new Map(pkg.sm2_state.map((entry) => [entry.vocab_id, entry]));
  const records: DueCardRecord[] = pkg.flashcards_due.map((card) => ({
    ...card,
    sm2: sm2ByVocabId.get(card.vocab_id),
  }));

  const db = await openOfflineDb();
  const tx = db.transaction('dueCards', 'readwrite');
  await tx.store.clear();
  await Promise.all(records.map((record) => tx.store.put(record)));
  await tx.done;

  return records;
}

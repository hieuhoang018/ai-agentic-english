import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { DueReviewItem, Sm2StateEntry } from '../api/types';

export type DueCardRecord = DueReviewItem & {
  sm2?: Sm2StateEntry;
};

export type PendingReviewRecord = {
  review_id: string;
  item_id: string;
  quality: number;
  reviewed_at: string;
};

interface OfflineDbSchema extends DBSchema {
  dueCards: {
    key: string;
    value: DueCardRecord;
  };
  pendingReviews: {
    key: string;
    value: PendingReviewRecord;
  };
}

const DB_NAME = 'english-academy-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OfflineDbSchema>> | null = null;

// Memoized so every caller (page effects, the SW's sync handler in a later
// stage) shares one open connection instead of racing separate `openDB`
// calls against the same database.
export function openOfflineDb() {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('dueCards')) {
          db.createObjectStore('dueCards', { keyPath: 'vocab_id' });
        }
        if (!db.objectStoreNames.contains('pendingReviews')) {
          db.createObjectStore('pendingReviews', { keyPath: 'review_id' });
        }
      },
    });
  }
  return dbPromise;
}

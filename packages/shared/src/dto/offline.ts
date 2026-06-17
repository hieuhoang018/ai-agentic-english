import { ReviewHighlightsDto, ReviewItemType } from './memory-progress';

export interface FlashcardDueDto {
  vocabItemId: string;
  term: string;
  meaning: string;
  exampleSentence: string | null;
  due: string;
}

export interface FsrsStateDto {
  itemId: string;
  itemType: ReviewItemType;
  due: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: number;
}

/** Phase 7 (`GET /offline-package`) response shape — defined now for forward-compatibility. */
export interface OfflinePackageDto {
  flashcardsDue: FlashcardDueDto[];
  fsrsState: FsrsStateDto[];
  highlightSnapshot: ReviewHighlightsDto;
}

export interface OfflineReviewInput {
  /** Client-generated id; used as the idempotency key on replay. */
  reviewId: string;
  itemId: string;
  itemType: ReviewItemType;
  /** ts-fsrs Grade: 1=Again, 2=Hard, 3=Good, 4=Easy. */
  rating: 1 | 2 | 3 | 4;
  reviewedAt: string;
}

/** Phase 7 (`POST /offline-sync`) request shape — defined now for forward-compatibility. */
export interface OfflineSyncRequestDto {
  reviews: OfflineReviewInput[];
}

export interface OfflineSyncResultDto {
  applied: number;
  skipped: number;
}

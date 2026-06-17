import { Card, Grade, Rating, State, createEmptyCard, fsrs, generatorParameters } from 'ts-fsrs';

export { Rating, State };
export type { Grade };

// enable_short_term disabled: our ReviewSchedule row doesn't persist learning_steps,
// so we only support FSRS's day-granularity (re)learning, not Anki-style minute steps.
const scheduler = fsrs(generatorParameters({ enable_short_term: false }));

export interface ReviewScheduleState {
  due: Date;
  stability: number;
  difficulty: number;
  lastReviewedAt: Date | null;
  reps: number;
  lapses: number;
  state: State;
}

function toCard(schedule: ReviewScheduleState): Card {
  return {
    due: schedule.due,
    stability: schedule.stability,
    difficulty: schedule.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: schedule.reps,
    lapses: schedule.lapses,
    state: schedule.state,
    last_review: schedule.lastReviewedAt ?? undefined,
  };
}

function fromCard(card: Card): ReviewScheduleState {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    lastReviewedAt: card.last_review ?? null,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
  };
}

export function createInitialReviewSchedule(now: Date = new Date()): ReviewScheduleState {
  return fromCard(createEmptyCard(now));
}

export function applyReview(schedule: ReviewScheduleState, grade: Grade, now: Date = new Date()): ReviewScheduleState {
  const { card } = scheduler.next(toCard(schedule), now, grade);
  return fromCard(card);
}

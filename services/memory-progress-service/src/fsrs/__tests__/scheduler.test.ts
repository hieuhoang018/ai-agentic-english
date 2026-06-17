import { describe, expect, it } from 'vitest';
import { Rating, State, applyReview, createInitialReviewSchedule } from '../scheduler';

describe('createInitialReviewSchedule', () => {
  it('creates a fresh card in the New state', () => {
    const now = new Date('2024-01-01T00:00:00.000Z');
    const schedule = createInitialReviewSchedule(now);

    expect(schedule).toEqual({
      due: now,
      stability: 0,
      difficulty: 0,
      lastReviewedAt: null,
      reps: 0,
      lapses: 0,
      state: State.New,
    });
  });
});

describe('applyReview', () => {
  // Reference values generated once via ts-fsrs (default weights, enable_short_term: false)
  // for this exact review sequence — locks in scheduling behavior across upgrades.
  it('matches reference FSRS output across a Good/Good/Again/Good sequence', () => {
    let schedule = createInitialReviewSchedule(new Date('2024-01-01T00:00:00.000Z'));

    schedule = applyReview(schedule, Rating.Good, new Date('2024-01-01T00:00:00.000Z'));
    expect(schedule.due).toEqual(new Date('2024-01-04T00:00:00.000Z'));
    expect(schedule.stability).toBeCloseTo(2.3065, 4);
    expect(schedule.difficulty).toBeCloseTo(2.11810397, 8);
    expect(schedule.reps).toBe(1);
    expect(schedule.lapses).toBe(0);
    expect(schedule.state).toBe(State.Review);

    schedule = applyReview(schedule, Rating.Good, new Date('2024-01-04T00:00:00.000Z'));
    expect(schedule.due).toEqual(new Date('2024-01-18T00:00:00.000Z'));
    expect(schedule.stability).toBeCloseTo(13.82690327, 8);
    expect(schedule.difficulty).toBeCloseTo(2.11121424, 8);
    expect(schedule.reps).toBe(2);
    expect(schedule.lapses).toBe(0);

    schedule = applyReview(schedule, Rating.Again, new Date('2024-01-12T00:00:00.000Z'));
    expect(schedule.due).toEqual(new Date('2024-01-14T00:00:00.000Z'));
    expect(schedule.stability).toBeCloseTo(1.63248681, 8);
    expect(schedule.difficulty).toBeCloseTo(7.39223814, 8);
    expect(schedule.reps).toBe(3);
    expect(schedule.lapses).toBe(1);

    schedule = applyReview(schedule, Rating.Good, new Date('2024-01-13T00:00:00.000Z'));
    expect(schedule.due).toEqual(new Date('2024-01-17T00:00:00.000Z'));
    expect(schedule.stability).toBeCloseTo(3.65368302, 8);
    expect(schedule.difficulty).toBeCloseTo(7.38007427, 8);
    expect(schedule.reps).toBe(4);
    expect(schedule.lapses).toBe(1);
    expect(schedule.state).toBe(State.Review);
  });

  it('is deterministic — same input always produces the same output', () => {
    const schedule = createInitialReviewSchedule(new Date('2024-01-01T00:00:00.000Z'));
    const now = new Date('2024-01-01T00:00:00.000Z');

    const a = applyReview(schedule, Rating.Good, now);
    const b = applyReview(schedule, Rating.Good, now);

    expect(a).toEqual(b);
  });
});

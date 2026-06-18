import { ExerciseInternalDto } from '@ai-agentic-english/shared';
import { describe, expect, it } from 'vitest';
import { gradeDeterministic } from '../index';

const now = '2024-01-01T00:00:00.000Z';

function exercise(type: ExerciseInternalDto['type'], answer: string): ExerciseInternalDto {
  return {
    id: 'ex-1',
    lessonId: 'les-1',
    type,
    prompt: {},
    answerKey: { answer },
    difficulty: 'easy',
    skill: 'reading',
    createdAt: now,
    updatedAt: now,
  };
}

describe('gradeDeterministic', () => {
  it('grades mcq correct (case/whitespace-insensitive)', () => {
    expect(gradeDeterministic(exercise('mcq', 'Red'), '  red  ')).toEqual({ isCorrect: true, score: 1 });
  });

  it('grades mcq incorrect', () => {
    expect(gradeDeterministic(exercise('mcq', 'Red'), 'Blue')).toEqual({ isCorrect: false, score: 0 });
  });

  it('grades fill-blank', () => {
    expect(gradeDeterministic(exercise('fill-blank', 'is writing'), 'is writing')).toEqual({
      isCorrect: true,
      score: 1,
    });
  });

  it('grades sentence-correction', () => {
    expect(
      gradeDeterministic(
        exercise('sentence-correction', 'She will return it next week.'),
        'She will return it next week.',
      ),
    ).toEqual({ isCorrect: true, score: 1 });
  });

  it('grades listening-comprehension', () => {
    expect(gradeDeterministic(exercise('listening-comprehension', '6 PM'), '6 pm')).toEqual({
      isCorrect: true,
      score: 1,
    });
  });

  it('treats a missing/empty submitted answer as incorrect', () => {
    expect(gradeDeterministic(exercise('mcq', 'Red'), undefined)).toEqual({ isCorrect: false, score: 0 });
    expect(gradeDeterministic(exercise('mcq', 'Red'), '')).toEqual({ isCorrect: false, score: 0 });
  });

  it('returns null for an unrecognized exercise type (caller falls back to LLM grading)', () => {
    expect(gradeDeterministic(exercise('essay' as ExerciseInternalDto['type'], 'anything'), 'anything')).toBeNull();
  });
});

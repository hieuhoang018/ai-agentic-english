import { PathDefinition } from '@ai-agentic-english/shared';
import { describe, expect, it } from 'vitest';
import { getNextPosition } from '../pathProgression';

const path: PathDefinition = {
  modules: [
    { moduleId: 'mod-1', lessons: [{ lessonId: 'les-1', exerciseIds: ['ex-1', 'ex-2'] }] },
    { moduleId: 'mod-2', lessons: [{ lessonId: 'les-2', exerciseIds: ['ex-3'] }] },
  ],
};

describe('getNextPosition', () => {
  it('returns the next exercise within the same lesson', () => {
    expect(getNextPosition(path, 'ex-1')).toEqual({ moduleId: 'mod-1', lessonId: 'les-1', exerciseId: 'ex-2' });
  });

  it('crosses into the next module/lesson', () => {
    expect(getNextPosition(path, 'ex-2')).toEqual({ moduleId: 'mod-2', lessonId: 'les-2', exerciseId: 'ex-3' });
  });

  it('returns null when the exercise is the last in the path', () => {
    expect(getNextPosition(path, 'ex-3')).toBeNull();
  });

  it('returns null when the exercise is not found in the path', () => {
    expect(getNextPosition(path, 'unknown')).toBeNull();
  });
});

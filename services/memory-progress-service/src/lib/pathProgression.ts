import { PathDefinition } from '@ai-agentic-english/shared';

export interface PathPosition {
  moduleId: string;
  lessonId: string;
  exerciseId: string;
}

// Flattens modules[].lessons[].exerciseIds[] in path order and returns the item right after
// `completedExerciseId`, or null if it was the last exercise in the path (or not found in it).
export function getNextPosition(pathDefinition: PathDefinition, completedExerciseId: string): PathPosition | null {
  const flattened: PathPosition[] = [];
  for (const m of pathDefinition.modules) {
    for (const l of m.lessons) {
      for (const exerciseId of l.exerciseIds) {
        flattened.push({ moduleId: m.moduleId, lessonId: l.lessonId, exerciseId });
      }
    }
  }

  const index = flattened.findIndex((p) => p.exerciseId === completedExerciseId);
  if (index === -1 || index === flattened.length - 1) return null;
  return flattened[index + 1];
}

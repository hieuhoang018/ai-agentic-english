import type { PracticeSkillId } from '../_types/practice';

export const practiceCenterPath = '/main/practice-center';

export function skillPath(skill: PracticeSkillId) {
  return `${practiceCenterPath}/${skill}`;
}

export function modulePath(
  skill: PracticeSkillId,
  moduleId: string,
  selection?: { lessonId?: string; exerciseId?: string },
) {
  const params = new URLSearchParams();
  if (selection?.lessonId) params.set('lesson', selection.lessonId);
  if (selection?.exerciseId) params.set('exercise', selection.exerciseId);

  const query = params.toString();
  return `${skillPath(skill)}/modules/${moduleId}${query ? `?${query}` : ''}`;
}

export function speakingPath() {
  return `${practiceCenterPath}/speaking`;
}

export function speakingHistoryPath() {
  return `${speakingPath()}/history`;
}

export function transcriptPath(conversationId: string) {
  return `${speakingHistoryPath()}/${conversationId}`;
}

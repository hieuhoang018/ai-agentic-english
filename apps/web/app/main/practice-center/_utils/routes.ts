import type { PracticeSkillId } from '../_types/practice'

export const practiceCenterPath = '/main/practice-center'

export function skillPath(skill: PracticeSkillId) {
  return `${practiceCenterPath}/${skill}`
}

export function modulePath(skill: PracticeSkillId, moduleId: string) {
  return `${skillPath(skill)}/modules/${moduleId}`
}

export function speakingPath() {
  return `${practiceCenterPath}/speaking`
}

export function speakingHistoryPath() {
  return `${speakingPath()}/history`
}

export function transcriptPath(conversationId: string) {
  return `${speakingHistoryPath()}/${conversationId}`
}

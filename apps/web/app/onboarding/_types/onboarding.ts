import type { CefrLevel } from '@/lib/api/types'

export type LearningGoalId = 'conversation' | 'ielts' | 'business' | 'travel' | 'personal'
export type AssessmentMethod = 'test' | 'selfAssessment'
export type SkillId = 'listening' | 'speaking' | 'reading' | 'writing'
export type PlacementSkillId = Exclude<SkillId, 'speaking'>

export const placementSkillIds = ['reading', 'listening', 'writing'] as const satisfies readonly PlacementSkillId[]

export interface OnboardingProfile {
  goalId: LearningGoalId
  assessmentMethod: AssessmentMethod
  levelScore: number
  assessmentLevels: Partial<Record<SkillId, CefrLevel>>
  assessmentCorrectAnswerCount: number
  assessmentQuestionCount: number
  dailyMinutes: number
  prioritySkills: SkillId[]
}

export interface GoalOption {
  id: LearningGoalId
  title: string
  description: string
  icon: string
  tone: string
}

export interface SkillOption {
  id: SkillId
  label: string
  icon: string
}

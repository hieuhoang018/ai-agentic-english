export type LearningGoalId = 'conversation' | 'ielts' | 'business' | 'travel' | 'personal'
export type AssessmentMethod = 'test' | 'selfAssessment'
export type SkillId = 'listening' | 'speaking' | 'reading' | 'writing'

export interface OnboardingProfile {
  goalId: LearningGoalId
  assessmentMethod: AssessmentMethod
  levelScore: number
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

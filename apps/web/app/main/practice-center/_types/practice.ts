export type PracticeSkillId = 'reading' | 'listening' | 'writing'

export type ModuleStatus = 'completed' | 'inProgress' | 'locked'

export type QuestionType = 'mcq' | 'shortAnswer' | 'writingPrompt'

export type SkillTone = 'blue' | 'green' | 'purple'

export interface PracticeSkill {
  id: PracticeSkillId
  title: string
  shortTitle: string
  icon: string
  description: string
  progressPercent: number
  href: string
  tone: SkillTone
}

export interface PracticeModule {
  id: string
  skill: PracticeSkillId
  order: number
  title: string
  subtitle: string
  description: string
  status: ModuleStatus
  progressPercent: number
  lessonsTotal: number
  lessonsCompleted: number
}

export interface TheoryBlock {
  title: string
  body: string
}

export interface PracticeFeedback {
  title: string
  message: string
  highlights: string[]
}

export interface McqOption {
  id: string
  label: string
}

export interface PracticeQuestion {
  id: string
  type: QuestionType
  prompt: string
  passage?: string
  context?: string
  options?: McqOption[]
  correctOptionId?: string
  placeholder?: string
}

export interface PracticeLesson {
  id: string
  skill: PracticeSkillId
  moduleId: string
  moduleTitle: string
  moduleSubtitle: string
  progressPercent: number
  questionNumber: number
  totalQuestions: number
  theory: TheoryBlock[]
  tip: string
  question: PracticeQuestion
  feedback: PracticeFeedback
}

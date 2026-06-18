export type ConversationStatus = 'perfect' | 'complete' | 'needsWork'

export type Speaker = 'ai' | 'user'

export interface ConversationSummary {
  id: string
  title: string
  date: string
  time: string
  durationMinutes: number
  status: ConversationStatus
  accuracyPercent: number
}

export interface SpeakingMessage {
  id: string
  speaker: Speaker
  content: string
  timestamp?: string
  note?: string
  correction?: {
    title: string
    issue: string
    suggestion: string
  }
}

export interface SpeakingGoal {
  id: string
  label: string
  completed: boolean
}

export interface TranscriptAnalysis {
  pronunciation: number
  vocabulary: number
  grammar: number
  vocabularyNote: string
  grammarNote: string
}

export interface ConversationDetail extends ConversationSummary {
  topic: string
  messages: SpeakingMessage[]
  goals: SpeakingGoal[]
  vocabularySuggestions: string[]
  analysis: TranscriptAnalysis
}

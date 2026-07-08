export type Speaker = 'ai' | 'user'

export interface SpeakingMessage {
  id: string
  speaker: Speaker
  content: string
}

export interface SessionErrorNote {
  id: string
  errorType: string
  severity: number
  contextExcerpt: string | null
}

export interface ConversationSummary {
  id: string
  sessionId: string
  date: string
  time: string
  durationMinutes: number
  title: string | null
  preview: string
  errorCount: number
}

export interface ConversationDetail extends ConversationSummary {
  messages: SpeakingMessage[]
  errors: SessionErrorNote[]
}

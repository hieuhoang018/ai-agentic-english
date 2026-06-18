export type ReviewArea = 'flashcards' | 'grammar'
export type FlashcardStatus = 'learned' | 'unlearned'
export type GrammarDifficulty = 'beginner' | 'intermediate' | 'advanced'
export type GrammarProgressState = 'notStarted' | 'inProgress' | 'completed'

export interface FlashcardTopic {
  id: string
  title: string
  description: string
  icon: string
  totalCards: number
  learnedCards: number
  tone: string
}

export interface Flashcard {
  id: string
  topicId: string
  term: string
  ipa: string
  partOfSpeech: string
  definition: string
  example: string
  status: FlashcardStatus
}

export interface GrammarExample {
  text: string
  note: string
  tone: 'primary' | 'success' | 'error'
}

export interface GrammarQuestion {
  id: string
  prompt: string
  options: string[]
  answer: string
}

export interface GrammarLesson {
  id: string
  categoryId: string
  title: string
  description: string
  difficulty: GrammarDifficulty
  completedExercises: number
  totalExercises: number
  state: GrammarProgressState
  icon: string
  theory?: {
    usage: string[]
    formulas: { label: string; value: string; tone: 'primary' | 'error' | 'warning' }[]
    signalWords: string[]
  }
  examples?: GrammarExample[]
  questions?: GrammarQuestion[]
}

export interface GrammarSection {
  id: string
  title: string
  markerClass: string
  lessons: GrammarLesson[]
}

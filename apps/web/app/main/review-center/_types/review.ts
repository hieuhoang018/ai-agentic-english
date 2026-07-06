export type ReviewArea = 'flashcards' | 'grammar'
export type GrammarDifficulty = 'beginner' | 'intermediate' | 'advanced'

export interface FlashcardTopic {
  id: string
  cefrLevel: string
  title: string
  description: string
  icon: string
  totalCards: number
  tone: string
}

export interface Flashcard {
  id: string
  topicId: string
  term: string
  ipa: string | null
  partOfSpeech: string
  definition: string | null
  example: string | null
  cefrLevel: string
  domainTag: string | null
}

export interface GrammarExample {
  id: string
  text: string
  note: string | null
}

export interface GrammarLesson {
  id: string
  categoryId: string
  category: string
  title: string
  description: string
  difficulty: GrammarDifficulty
  cefrLevel: string
  exampleCount: number
  icon: string
  examples?: GrammarExample[]
  source?: string
  license?: string
}

export interface GrammarSection {
  id: string
  title: string
  category: string
  markerClass: string
  cefrLevels: string[]
  lessons: GrammarLesson[]
}

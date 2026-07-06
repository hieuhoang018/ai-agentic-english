import { isApiError } from '@/lib/api/client'
import { serverApiFetch } from '@/lib/api/server'
import type {
  CefrLevel,
  ReviewFlashcardDto,
  ReviewFlashcardTopicDto,
  ReviewGrammarLessonDto,
  ReviewGrammarLessonSummaryDto,
  ReviewGrammarSectionDto,
} from '@/lib/api/types'

import type { Flashcard, FlashcardTopic, GrammarDifficulty, GrammarLesson, GrammarSection } from '../_types/review'

const flashcardTopicStyle: Record<CefrLevel, { icon: string; tone: string }> = {
  A1: { icon: 'looks_one', tone: 'from-blue-100 to-blue-200 text-primary' },
  A2: { icon: 'looks_two', tone: 'from-emerald-100 to-emerald-200 text-[#0a9f5a]' },
  B1: { icon: 'looks_3', tone: 'from-orange-100 to-orange-200 text-[#e85d04]' },
  B2: { icon: 'looks_4', tone: 'from-violet-100 to-violet-200 text-tertiary' },
  C1: { icon: 'looks_5', tone: 'from-red-100 to-red-200 text-error' },
  C2: { icon: 'looks_6', tone: 'from-yellow-100 to-yellow-200 text-[#b77900]' },
}

const grammarMarkers = [
  'bg-primary',
  'bg-secondary',
  'bg-tertiary',
  'bg-orange-700',
  'bg-error',
  'bg-outline',
]

function difficultyFromCefr(cefrLevel: string): GrammarDifficulty {
  if (cefrLevel === 'A1' || cefrLevel === 'A2') return 'beginner'
  if (cefrLevel === 'B1' || cefrLevel === 'B2') return 'intermediate'
  return 'advanced'
}

function iconForGrammarCategory(category: string) {
  const normalized = category.toLowerCase()
  if (normalized.includes('tense') || normalized.includes('verb')) return 'schedule'
  if (normalized.includes('question')) return 'help'
  if (normalized.includes('clause') || normalized.includes('relative')) return 'account_tree'
  if (normalized.includes('modal')) return 'tune'
  if (normalized.includes('noun') || normalized.includes('pronoun')) return 'label'
  if (normalized.includes('comparison')) return 'compare_arrows'
  return 'menu_book'
}

function mapFlashcardTopic(topic: ReviewFlashcardTopicDto): FlashcardTopic {
  const style = flashcardTopicStyle[topic.cefrLevel]
  return {
    id: topic.id,
    cefrLevel: topic.cefrLevel,
    title: topic.title,
    description: topic.description,
    icon: style.icon,
    totalCards: topic.totalCards,
    tone: style.tone,
  }
}

function mapFlashcard(card: ReviewFlashcardDto): Flashcard {
  return {
    id: card.id,
    topicId: card.topicId,
    term: card.term,
    ipa: card.ipa,
    partOfSpeech: card.partOfSpeech,
    definition: card.definition,
    example: card.example,
    cefrLevel: card.cefrLevel,
    domainTag: card.domainTag,
  }
}

function mapGrammarLesson(lesson: ReviewGrammarLessonSummaryDto | ReviewGrammarLessonDto): GrammarLesson {
  return {
    id: lesson.id,
    categoryId: lesson.categoryId,
    category: lesson.category,
    title: lesson.title,
    description: lesson.explanation,
    difficulty: difficultyFromCefr(lesson.cefrLevel),
    cefrLevel: lesson.cefrLevel,
    exampleCount: lesson.exampleCount,
    icon: iconForGrammarCategory(lesson.category),
    examples:
      'examples' in lesson
        ? lesson.examples.map((example) => ({
            id: example.id,
            text: example.sentence,
            note: example.note,
          }))
        : undefined,
    source: 'source' in lesson ? lesson.source : undefined,
    license: 'license' in lesson ? lesson.license : undefined,
  }
}

function mapGrammarSection(section: ReviewGrammarSectionDto, index = 0): GrammarSection {
  return {
    id: section.id,
    category: section.category,
    title: section.title,
    markerClass: grammarMarkers[index % grammarMarkers.length],
    cefrLevels: section.cefrLevels,
    lessons: section.lessons.map(mapGrammarLesson),
  }
}

function isReviewApiUnavailable(error: unknown) {
  return (
    (isApiError(error) && error.status === 404) ||
    (error instanceof TypeError && error.message.includes('API request failed before reaching the gateway'))
  )
}

export async function getReviewFlashcardTopics() {
  try {
    const topics = await serverApiFetch<ReviewFlashcardTopicDto[]>('/review/flashcard-topics')
    return topics.map(mapFlashcardTopic)
  } catch (error) {
    if (isReviewApiUnavailable(error)) return []
    throw error
  }
}

export async function getReviewFlashcardTopic(topicId: string) {
  const topics = await getReviewFlashcardTopics()
  return topics.find((topic) => topic.id === topicId.toUpperCase()) ?? null
}

export async function getReviewFlashcardsByTopic(topicId: string) {
  try {
    const cards = await serverApiFetch<ReviewFlashcardDto[]>(
      `/review/flashcard-topics/${encodeURIComponent(topicId.toUpperCase())}/flashcards?limit=200`,
    )
    return cards.map(mapFlashcard)
  } catch (error) {
    if (isReviewApiUnavailable(error)) return []
    throw error
  }
}

export async function getReviewGrammarSections() {
  try {
    const sections = await serverApiFetch<ReviewGrammarSectionDto[]>('/review/grammar/sections')
    return sections.map(mapGrammarSection)
  } catch (error) {
    if (isReviewApiUnavailable(error)) return []
    throw error
  }
}

export async function getReviewGrammarCategory(categoryId: string) {
  try {
    const section = await serverApiFetch<ReviewGrammarSectionDto>(
      `/review/grammar/sections/${encodeURIComponent(categoryId)}`,
    )
    return mapGrammarSection(section)
  } catch (error) {
    if (isReviewApiUnavailable(error)) return null
    throw error
  }
}

export async function getReviewGrammarLesson(categoryId: string, lessonId: string) {
  try {
    const lesson = await serverApiFetch<ReviewGrammarLessonDto>(
      `/review/grammar/lessons/${encodeURIComponent(lessonId)}`,
    )
    if (lesson.categoryId !== categoryId) return null
    return mapGrammarLesson(lesson)
  } catch (error) {
    if (isReviewApiUnavailable(error)) return null
    throw error
  }
}

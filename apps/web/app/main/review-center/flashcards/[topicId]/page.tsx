import { notFound } from 'next/navigation'
import ReviewEmptyState from '../../_components/ReviewEmptyState'
import FlashcardGrid from '../../_components/FlashcardGrid'
import { getReviewFlashcardTopic, getReviewFlashcardsByTopic } from '../../_lib/review-api'

type FlashcardTopicPageProps = {
  params: Promise<{ topicId: string }>
}

export const dynamic = 'force-dynamic'

export default async function FlashcardTopicPage({ params }: FlashcardTopicPageProps) {
  const { topicId } = await params
  const topic = await getReviewFlashcardTopic(topicId)
  if (!topic) notFound()

  const cards = await getReviewFlashcardsByTopic(topic.id)

  return cards.length > 0 ? (
    <FlashcardGrid topic={topic} cards={cards} />
  ) : (
    <ReviewEmptyState
      icon="style"
      title="No flashcards found"
      description="This CEFR topic exists, but it has no vocab rows available for review. Check the vocab seed data and refresh the page."
    />
  )
}

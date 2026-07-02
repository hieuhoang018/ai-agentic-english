import { notFound } from 'next/navigation'
import FlashcardStudy from '../../../_components/FlashcardStudy'
import { getReviewFlashcardTopic, getReviewFlashcardsByTopic } from '../../../_lib/review-api'

type FlashcardStudyPageProps = {
  params: Promise<{ topicId: string }>
}

export const dynamic = 'force-dynamic'

export default async function FlashcardStudyPage({ params }: FlashcardStudyPageProps) {
  const { topicId } = await params
  const topic = await getReviewFlashcardTopic(topicId)
  if (!topic) notFound()

  return <FlashcardStudy cards={await getReviewFlashcardsByTopic(topic.id)} />
}

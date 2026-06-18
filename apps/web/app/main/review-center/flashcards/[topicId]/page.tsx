import { notFound } from 'next/navigation'
import FlashcardGrid from '../../_components/FlashcardGrid'
import { getFlashcardParams, getFlashcardsByTopic, getFlashcardTopic } from '../../_data/review-content'

type FlashcardTopicPageProps = {
  params: Promise<{ topicId: string }>
}

export function generateStaticParams() {
  return getFlashcardParams()
}

export default async function FlashcardTopicPage({ params }: FlashcardTopicPageProps) {
  const { topicId } = await params
  const topic = getFlashcardTopic(topicId)
  if (!topic) notFound()

  return <FlashcardGrid topic={topic} cards={getFlashcardsByTopic(topicId)} />
}

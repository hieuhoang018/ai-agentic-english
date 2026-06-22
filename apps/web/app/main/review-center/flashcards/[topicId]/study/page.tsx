import { notFound } from 'next/navigation'
import FlashcardStudy from '../../../_components/FlashcardStudy'
import { getFlashcardParams, getFlashcardsByTopic, getFlashcardTopic } from '../../../_data/review-content'

type FlashcardStudyPageProps = {
  params: Promise<{ topicId: string }>
}

export function generateStaticParams() {
  return getFlashcardParams()
}

export default async function FlashcardStudyPage({ params }: FlashcardStudyPageProps) {
  const { topicId } = await params
  const topic = getFlashcardTopic(topicId)
  if (!topic) notFound()

  return <FlashcardStudy cards={getFlashcardsByTopic(topicId)} />
}

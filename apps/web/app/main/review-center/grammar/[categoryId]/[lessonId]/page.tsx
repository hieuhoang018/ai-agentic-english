import { notFound } from 'next/navigation'
import GrammarLessonView from '../../../_components/GrammarLessonView'
import { getReviewGrammarLesson } from '../../../_lib/review-api'

type GrammarLessonPageProps = {
  params: Promise<{ categoryId: string; lessonId: string }>
}

export const dynamic = 'force-dynamic'

export default async function GrammarLessonPage({ params }: GrammarLessonPageProps) {
  const { categoryId, lessonId } = await params
  const lesson = await getReviewGrammarLesson(categoryId, lessonId)
  if (!lesson) notFound()

  return <GrammarLessonView lesson={lesson} />
}

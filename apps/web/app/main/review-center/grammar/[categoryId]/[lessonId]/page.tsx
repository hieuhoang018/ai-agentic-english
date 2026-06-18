import { notFound } from 'next/navigation'
import GrammarLessonView from '../../../_components/GrammarLessonView'
import { getGrammarLesson, getGrammarLessonParams } from '../../../_data/review-content'

type GrammarLessonPageProps = {
  params: Promise<{ categoryId: string; lessonId: string }>
}

export function generateStaticParams() {
  return getGrammarLessonParams()
}

export default async function GrammarLessonPage({ params }: GrammarLessonPageProps) {
  const { categoryId, lessonId } = await params
  const lesson = getGrammarLesson(categoryId, lessonId)
  if (!lesson) notFound()

  return <GrammarLessonView lesson={lesson} />
}

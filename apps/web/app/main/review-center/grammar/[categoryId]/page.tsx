import { notFound } from 'next/navigation'
import GrammarSection from '../../_components/GrammarSection'
import { getGrammarCategory, getGrammarCategoryParams } from '../../_data/review-content'

type GrammarCategoryPageProps = {
  params: Promise<{ categoryId: string }>
}

export function generateStaticParams() {
  return getGrammarCategoryParams()
}

export default async function GrammarCategoryPage({ params }: GrammarCategoryPageProps) {
  const { categoryId } = await params
  const category = getGrammarCategory(categoryId)
  if (!category) notFound()

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-bold text-on-surface">{category.title}</h1>
          <p className="mt-3 text-lg text-on-surface-variant">{category.lessons.length * 3} bài học • Nắm vững nền tảng thời gian trong tiếng Anh</p>
        </div>
        <button className="flex h-12 items-center gap-3 rounded-lg border border-outline-variant bg-white px-5 text-on-surface">
          <span className="material-symbols-outlined">filter_list</span>
          Tất cả độ khó
          <span className="material-symbols-outlined">expand_more</span>
        </button>
      </div>
      <GrammarSection section={category} compact={false} />
    </div>
  )
}

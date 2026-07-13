import { notFound } from 'next/navigation'
import GrammarSection from '../../_components/GrammarSection'
import { getReviewGrammarCategory } from '../../_lib/review-api'

type GrammarCategoryPageProps = {
  params: Promise<{ categoryId: string }>
}

export const dynamic = 'force-dynamic'

export default async function GrammarCategoryPage({ params }: GrammarCategoryPageProps) {
  const { categoryId } = await params
  const category = await getReviewGrammarCategory(categoryId)
  if (!category) notFound()

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-on-surface dark:text-on-primary sm:text-4xl">{category.title}</h1>
          <p className="mt-3 text-base text-on-surface-variant dark:text-surface-dim sm:text-lg">
            {category.lessons.length} database lessons across {category.cefrLevels.join(', ')}
          </p>
        </div>
        <span className="inline-flex h-10 items-center rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-sm font-semibold text-on-surface-variant dark:border-outline dark:bg-surface-dark dark:text-surface-dim">
          Read-only catalog
        </span>
      </div>
      <GrammarSection section={category} compact={false} />
    </div>
  )
}

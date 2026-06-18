import Link from 'next/link'
import type { GrammarSection as GrammarSectionType } from '../_types/review'
import { grammarCategoryPath } from '../_utils/review-routes'
import GrammarTopicCard from './GrammarTopicCard'

type GrammarSectionProps = {
  section: GrammarSectionType
  compact?: boolean
}

export default function GrammarSection({ section, compact = true }: GrammarSectionProps) {
  const lessons = compact ? section.lessons.slice(0, 3) : section.lessons

  return (
    <section className="mb-10">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="flex items-center gap-3 text-2xl font-bold text-on-surface">
          <span className={`h-2 w-2 rounded-full ${section.markerClass}`} />
          {section.title}
        </h2>
        {compact ? <Link href={grammarCategoryPath(section.id)} className="text-sm font-bold text-primary">Xem tất cả</Link> : null}
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {lessons.map((lesson) => <GrammarTopicCard key={lesson.id} lesson={lesson} />)}
      </div>
    </section>
  )
}

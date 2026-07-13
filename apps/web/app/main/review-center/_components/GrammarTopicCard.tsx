import Link from 'next/link'
import type { GrammarLesson } from '../_types/review'
import { grammarLessonPath } from '../_utils/review-routes'

type GrammarTopicCardProps = {
  lesson: GrammarLesson
}

const difficultyLabel = {
  beginner: 'BEGINNER',
  intermediate: 'INTERMEDIATE',
  advanced: 'ADVANCED',
}

export default function GrammarTopicCard({ lesson }: GrammarTopicCardProps) {
  return (
    <article className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-6 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.5)] dark:border-outline/60 dark:bg-surface-dark">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-fixed text-primary dark:text-primary-fixed-dim">
          <span className="material-symbols-outlined">{lesson.icon}</span>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-primary dark:text-primary-fixed-dim">
            {lesson.cefrLevel}
          </span>
          <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-bold text-on-surface-variant dark:bg-surface-dark-high dark:text-surface-dim">
            {difficultyLabel[lesson.difficulty]}
          </span>
        </div>
      </div>
      <h3 className="text-xl font-bold text-on-surface dark:text-on-primary">{lesson.title}</h3>
      <p className="mt-3 min-h-24 leading-7 text-on-surface-variant dark:text-surface-dim">{lesson.description}</p>
      <div className="mt-5 flex items-center justify-between border-t border-outline-variant/40 pt-4 text-sm dark:border-outline/40">
        <span className="text-on-surface-variant dark:text-surface-dim">Examples</span>
        <span className="font-bold text-primary dark:text-primary-fixed-dim">{lesson.exampleCount}</span>
      </div>
      <Link
        href={grammarLessonPath(lesson.categoryId, lesson.id)}
        className="mt-6 flex h-11 items-center justify-center rounded-lg border border-primary bg-primary px-4 font-bold text-white"
      >
        Open lesson
      </Link>
    </article>
  )
}

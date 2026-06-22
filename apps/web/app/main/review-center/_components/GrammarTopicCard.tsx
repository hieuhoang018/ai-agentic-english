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
  const progress = Math.round((lesson.completedExercises / lesson.totalExercises) * 100)
  const isCompleted = lesson.state === 'completed'
  const isNotStarted = lesson.state === 'notStarted'

  return (
    <article className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-6 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.5)]">
      <div className="mb-5 flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-fixed text-primary">
          <span className="material-symbols-outlined">{lesson.icon}</span>
        </div>
        <span className="rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-on-surface-variant">{difficultyLabel[lesson.difficulty]}</span>
      </div>
      <h3 className="text-xl font-bold text-on-surface">{lesson.title}</h3>
      <p className="mt-3 min-h-20 leading-7 text-on-surface-variant">{lesson.description}</p>
      <div className="mt-5">
        <div className="mb-2 flex justify-between text-sm">
          <span>Tiến độ học</span>
          <span className="font-bold text-primary">{lesson.completedExercises}/{lesson.totalExercises} bài tập</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-variant">
          <div className={`h-full rounded-full ${isCompleted ? 'bg-secondary' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
        </div>
      </div>
      <Link href={grammarLessonPath(lesson.categoryId, lesson.id)} className={`mt-6 flex h-11 items-center justify-center rounded-lg border px-4 font-bold ${isCompleted ? 'border-emerald-100 bg-emerald-50 text-secondary' : isNotStarted ? 'border-primary bg-white text-primary' : 'border-primary bg-primary text-white'}`}>
        {isCompleted ? 'Đã hoàn thành' : isNotStarted ? 'Bắt đầu ngay' : 'Luyện tập ngay'}
      </Link>
    </article>
  )
}

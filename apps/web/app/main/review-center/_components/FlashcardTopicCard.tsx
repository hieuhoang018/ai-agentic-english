import Link from 'next/link'
import type { FlashcardTopic } from '../_types/review'
import { flashcardTopicPath } from '../_utils/review-routes'

type FlashcardTopicCardProps = {
  topic: FlashcardTopic
}

export default function FlashcardTopicCard({ topic }: FlashcardTopicCardProps) {
  return (
    <Link
      href={flashcardTopicPath(topic.id)}
      className="overflow-hidden rounded-lg border border-outline-variant/50 bg-surface-container-lowest shadow-[0_8px_24px_-20px_rgba(15,23,42,0.5)] transition-transform hover:-translate-y-1"
    >
      <div className={`flex h-32 items-center justify-center bg-linear-to-br ${topic.tone}`}>
        <span className="material-symbols-outlined text-5xl">{topic.icon}</span>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-on-surface">{topic.title}</h2>
          <span className="rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-primary">
            {topic.cefrLevel}
          </span>
        </div>
        <p className="mt-2 min-h-12 text-sm leading-6 text-on-surface-variant">{topic.description}</p>
        <div className="mt-4 flex items-center justify-between border-t border-outline-variant/40 pt-4">
          <span className="rounded-lg bg-surface-container px-3 py-1 text-sm font-semibold text-on-surface">
            {topic.totalCards} cards
          </span>
          <span className="text-sm font-bold text-primary">Open</span>
        </div>
      </div>
    </Link>
  )
}

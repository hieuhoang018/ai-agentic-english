"use client"

import Link from 'next/link'
import type { Flashcard, FlashcardTopic } from '../_types/review'
import { flashcardStudyPath } from '../_utils/review-routes'

type FlashcardGridProps = {
  topic: FlashcardTopic
  cards: Flashcard[]
}

export default function FlashcardGrid({ topic, cards }: FlashcardGridProps) {
  return (
    <div>
      <section className="mb-7 rounded-lg border border-outline-variant/40 bg-surface-container-lowest p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-primary">
              <span className="material-symbols-outlined">{topic.icon}</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-on-surface sm:text-3xl">{topic.title}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-on-surface-variant">
                <span className="rounded bg-primary-fixed px-3 py-1 font-bold text-primary">
                  {topic.cefrLevel}
                </span>
                <span>{topic.totalCards} catalog cards</span>
                <span>{cards.length} loaded for this view</span>
              </div>
            </div>
          </div>
          <Link
            href={flashcardStudyPath(topic.id)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 font-semibold text-white sm:w-auto"
          >
            <span className="material-symbols-outlined">style</span>
            Study cards
          </Link>
        </div>
      </section>

      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-on-surface-variant">
          Showing database records from the learning-materials catalog.
        </p>
        <span className="text-sm text-on-surface-variant">
          Sorted: <b>A-Z</b>
        </span>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article
            key={card.id}
            className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-4 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.5)] sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="material-symbols-outlined text-primary">style</span>
              <span className="rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-primary">
                {card.cefrLevel}
              </span>
            </div>
            <h2 className="mt-5 text-xl font-bold text-on-surface">{card.term}</h2>
            <p className="mt-1 min-h-5 text-sm text-on-surface-variant">{card.ipa ?? 'IPA unavailable'}</p>
            <div className="my-5 h-px bg-outline-variant/40" />
            <p className="text-sm font-semibold text-on-surface">{card.partOfSpeech}</p>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-on-surface-variant">
              {card.definition ?? 'Definition unavailable.'}
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}

"use client"

import { useState } from 'react'
import type { Flashcard } from '../_types/review'

type FlashcardStudyProps = {
  cards: Flashcard[]
}

export default function FlashcardStudy({ cards }: FlashcardStudyProps) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const card = cards[index] ?? cards[0]

  if (!card) {
    return (
      <div className="mx-auto max-w-3xl pt-28 text-center">
        <div className="rounded-lg border border-dashed border-outline-variant bg-white p-10 dark:border-outline dark:bg-surface-dark">
          <span className="material-symbols-outlined text-5xl text-outline">style</span>
          <h1 className="mt-4 text-2xl font-bold text-on-surface dark:text-on-primary">No cards to study</h1>
          <p className="mt-2 text-on-surface-variant dark:text-surface-dim">
            This CEFR topic has no vocab rows available yet. Seed vocab entries and refresh this page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl pt-6 sm:pt-16 lg:pt-28">
      <div className="mb-7 flex items-center justify-between">
        <span className="text-on-surface-variant dark:text-surface-dim">
          Card {index + 1} / {cards.length}
        </span>
        <span className="rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-primary dark:text-primary-fixed-dim">
          {card.cefrLevel}
        </span>
      </div>

      <button
        onClick={() => setFlipped((value) => !value)}
        className="flex min-h-[360px] w-full flex-col items-center justify-center rounded-lg border border-outline-variant bg-white p-5 text-center shadow-[0_12px_36px_-24px_rgba(15,23,42,0.55)] sm:min-h-[480px] sm:p-8 dark:border-outline dark:bg-surface-dark"
      >
        {!flipped ? (
          <>
            <span className="text-sm uppercase tracking-wider text-on-surface-variant dark:text-surface-dim">Vocabulary</span>
            <h1 className="mt-6 text-3xl font-bold text-primary dark:text-primary-fixed-dim sm:text-4xl">{card.term}</h1>
            <p className="mt-3 min-h-8 text-xl text-on-surface dark:text-on-primary">{card.ipa ?? 'IPA unavailable'}</p>
            <span className="mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-primary-fixed text-primary dark:text-primary-fixed-dim">
              <span className="material-symbols-outlined">style</span>
            </span>
            <p className="mt-20 text-on-surface-variant dark:text-surface-dim">Tap to flip</p>
          </>
        ) : (
          <>
            <span className="text-sm uppercase tracking-wider text-on-surface-variant dark:text-surface-dim">
              {card.partOfSpeech}
            </span>
            <h1 className="mt-6 text-2xl font-bold text-on-surface sm:text-3xl dark:text-on-primary">
              {card.definition ?? 'Definition unavailable.'}
            </h1>
            {card.example ? (
              <p className="mt-6 text-lg leading-8 text-on-surface-variant dark:text-surface-dim">{card.example}</p>
            ) : (
              <p className="mt-6 text-lg leading-8 text-on-surface-variant dark:text-surface-dim">
                No example sentence is available for this catalog entry.
              </p>
            )}
          </>
        )}
      </button>

      <div className="mt-8 flex items-center justify-center gap-3 sm:gap-6">
        <button
          onClick={() => {
            setIndex((value) => Math.max(0, value - 1))
            setFlipped(false)
          }}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-outline-variant bg-white dark:border-outline dark:bg-surface-dark"
          aria-label="Previous card"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <button
          onClick={() => setFlipped((value) => !value)}
          className="flex h-12 items-center gap-2 rounded-lg bg-primary px-5 font-bold text-white sm:px-8"
        >
          <span className="material-symbols-outlined">sync</span>
          Flip card
        </button>
        <button
          onClick={() => {
            setIndex((value) => Math.min(cards.length - 1, value + 1))
            setFlipped(false)
          }}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-outline-variant bg-white dark:border-outline dark:bg-surface-dark"
          aria-label="Next card"
        >
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
      </div>
    </div>
  )
}

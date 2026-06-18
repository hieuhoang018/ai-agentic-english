"use client"

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Flashcard, FlashcardTopic } from '../_types/review'
import { flashcardStudyPath } from '../_utils/review-routes'

type FlashcardGridProps = {
  topic: FlashcardTopic
  cards: Flashcard[]
}

export default function FlashcardGrid({ topic, cards }: FlashcardGridProps) {
  const [filter, setFilter] = useState<'all' | 'unlearned' | 'learned'>('all')
  const filtered = useMemo(() => cards.filter((card) => filter === 'all' || card.status === filter), [cards, filter])
  const progress = Math.round((topic.learnedCards / topic.totalCards) * 100)

  return (
    <div>
      <section className="mb-7 rounded-lg border border-outline-variant/40 bg-surface-container-lowest p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-primary">
              <span className="material-symbols-outlined">{topic.icon}</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-on-surface">Chủ đề: {topic.title}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                <span>Tiến độ</span>
                <div className="h-2 w-44 overflow-hidden rounded-full bg-surface-variant"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div>
                <span className="font-bold text-primary">{topic.learnedCards}/{topic.totalCards} thẻ</span>
                <span className="rounded bg-primary-fixed px-3 py-1 text-on-surface-variant">Đã thuộc {progress}%</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="flex h-12 items-center gap-2 rounded-lg border border-primary px-5 font-semibold text-primary"><span className="material-symbols-outlined">add</span>Thêm thẻ mới</button>
            <Link href={flashcardStudyPath(topic.id)} className="flex h-12 items-center gap-2 rounded-lg bg-primary px-5 font-semibold text-white"><span className="material-symbols-outlined">style</span>Bắt đầu học ngay</Link>
          </div>
        </div>
      </section>

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            ['all', `Tất cả (${cards.length})`],
            ['unlearned', `Chưa thuộc (${cards.filter((card) => card.status === 'unlearned').length})`],
            ['learned', `Đã thuộc (${cards.filter((card) => card.status === 'learned').length})`],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key as 'all' | 'unlearned' | 'learned')} className={`h-10 rounded-full border px-4 text-sm ${filter === key ? 'border-primary bg-primary-fixed text-primary' : 'border-outline-variant bg-white text-on-surface'}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="text-sm text-on-surface-variant">Sắp xếp: <b>A-Z</b></span>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {filtered.map((card) => (
          <article key={card.id} className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.5)]">
            <span className={`material-symbols-outlined ${card.status === 'learned' ? 'text-secondary' : 'text-outline'}`}>{card.status === 'learned' ? 'check_circle' : 'radio_button_unchecked'}</span>
            <h2 className="mt-5 text-xl font-bold text-on-surface">{card.term}</h2>
            <p className="mt-1 text-sm text-on-surface-variant">{card.ipa}</p>
            <div className="my-5 h-px bg-outline-variant/40" />
            <p className="text-sm text-on-surface-variant">{card.partOfSpeech}</p>
          </article>
        ))}
      </div>
    </div>
  )
}

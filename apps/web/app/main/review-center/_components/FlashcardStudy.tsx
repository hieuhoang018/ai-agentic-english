"use client"

import { useState } from 'react'
import type { Flashcard } from '../_types/review'
import FlashcardOptionsMenu from './FlashcardOptionsMenu'

type FlashcardStudyProps = {
  cards: Flashcard[]
}

export default function FlashcardStudy({ cards }: FlashcardStudyProps) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const card = cards[index] ?? cards[0]

  if (!card) {
    return (
      <div className="mx-auto max-w-3xl pt-28 text-center">
        <div className="rounded-lg border border-dashed border-outline-variant bg-white p-10">
          <span className="material-symbols-outlined text-5xl text-outline">style</span>
          <h1 className="mt-4 text-2xl font-bold text-on-surface">Chưa có thẻ để học</h1>
          <p className="mt-2 text-on-surface-variant">Chủ đề này sẽ hiển thị thẻ học khi dữ liệu flashcard được thêm vào.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl pt-28">
      <div className="mb-7 flex items-center justify-between">
        <span className="text-on-surface-variant">Thẻ {index + 1} / {cards.length}</span>
        <div className="relative flex items-center gap-4">
          <button className="text-on-surface-variant"><span className="material-symbols-outlined">fullscreen</span></button>
          <button onClick={() => setMenuOpen((value) => !value)} className="text-on-surface-variant"><span className="material-symbols-outlined">more_vert</span></button>
          <FlashcardOptionsMenu open={menuOpen} />
        </div>
      </div>

      <button onClick={() => setFlipped((value) => !value)} className="flex min-h-[480px] w-full flex-col items-center justify-center rounded-lg border border-outline-variant bg-white p-8 text-center shadow-[0_12px_36px_-24px_rgba(15,23,42,0.55)]">
        {!flipped ? (
          <>
            <span className="text-sm uppercase tracking-wider text-on-surface-variant">Từ vựng</span>
            <h1 className="mt-6 text-4xl font-bold text-primary">{card.term}</h1>
            <p className="mt-3 text-xl text-on-surface">{card.ipa}</p>
            <span className="mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-primary-fixed text-primary"><span className="material-symbols-outlined">volume_up</span></span>
            <p className="mt-20 text-on-surface-variant">Chạm để lật</p>
          </>
        ) : (
          <>
            <span className="text-sm uppercase tracking-wider text-on-surface-variant">{card.partOfSpeech}</span>
            <h1 className="mt-6 text-3xl font-bold text-on-surface">{card.definition}</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-on-surface-variant">{card.example}</p>
          </>
        )}
      </button>

      <div className="mt-8 flex items-center justify-center gap-6">
        <button onClick={() => setIndex((value) => Math.max(0, value - 1))} className="flex h-12 w-12 items-center justify-center rounded-full border border-outline-variant bg-white"><span className="material-symbols-outlined">arrow_back</span></button>
        <button onClick={() => setFlipped((value) => !value)} className="flex h-12 items-center gap-2 rounded-lg bg-primary px-8 font-bold text-white"><span className="material-symbols-outlined">sync</span>Lật thẻ</button>
        <button onClick={() => setIndex((value) => Math.min(cards.length - 1, value + 1))} className="flex h-12 w-12 items-center justify-center rounded-full border border-outline-variant bg-white"><span className="material-symbols-outlined">arrow_forward</span></button>
      </div>
    </div>
  )
}

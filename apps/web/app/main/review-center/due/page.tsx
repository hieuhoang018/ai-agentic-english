'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import type { DueReviewItem } from '@/lib/api/types'
import { readDueCardsFromIndexedDb, syncPackageToIndexedDb } from '@/lib/offline/package'
import { flushPendingReviews, queueReview } from '@/lib/offline/reviews'
import { reviewCenterPath } from '../_utils/review-routes'

type LoadState =
  | { status: 'loading' }
  | { status: 'success'; items: DueReviewItem[] }
  | { status: 'error' }

const RATING_OPTIONS: { label: string; quality: number; tone: string }[] = [
  { label: 'Quên', quality: 0, tone: 'bg-error/10 text-error dark:text-red-400 hover:bg-error/20' },
  {
    label: 'Khó',
    quality: 2,
    tone: 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50',
  },
  { label: 'Tốt', quality: 4, tone: 'bg-secondary-container/40 text-secondary hover:bg-secondary-container/60' },
  { label: 'Dễ', quality: 5, tone: 'bg-primary-container/30 text-primary dark:text-primary-fixed-dim hover:bg-primary-container/50' },
]

export default function DueReviewPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [ratedCount, setRatedCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const cached = await readDueCardsFromIndexedDb()
        if (!cancelled && cached.length > 0) {
          setState({ status: 'success', items: cached })
        }
      } catch {
        // IndexedDB unavailable (e.g. private browsing) — fall through to the network.
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (!cancelled) {
          setState((current) => (current.status === 'success' ? current : { status: 'error' }))
        }
        return
      }

      try {
        const fresh = await syncPackageToIndexedDb()
        if (!cancelled) setState({ status: 'success', items: fresh })
      } catch {
        if (!cancelled) {
          setState((current) => (current.status === 'success' ? current : { status: 'error' }))
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function submitRating(item: DueReviewItem, quality: number) {
    setSubmitting(true)
    try {
      // Queue locally first (optimistic) — the UI advances regardless of
      // network state. The flush below is best-effort; Stage 3 adds the
      // Background Sync / online-event triggers that catch it otherwise.
      await queueReview(item.vocab_id, quality)
      setRatedCount((count) => count + 1)
      setIndex((value) => value + 1)
      setRevealed(false)

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        flushPendingReviews().catch(() => {})
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl pt-6 sm:pt-16">
      <div className="mb-7 flex items-center justify-between">
        <Link
          href={reviewCenterPath}
          className="text-sm text-on-surface-variant hover:text-primary dark:hover:text-primary-fixed-dim dark:text-surface-dim"
        >
          &larr; Quay lại Trung tâm ôn luyện
        </Link>
        {state.status === 'success' && state.items.length > 0 && (
          <span className="text-on-surface-variant dark:text-surface-dim">
            {Math.min(index + 1, state.items.length)} / {state.items.length}
          </span>
        )}
      </div>

      {state.status === 'loading' && (
        <p className="text-center text-on-surface-variant">Đang tải danh sách từ đến hạn...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-lg border border-dashed border-outline-variant bg-white p-10 text-center dark:border-outline dark:bg-surface-dark">
          <span className="material-symbols-outlined text-5xl text-error dark:text-red-400">error</span>
          <h1 className="mt-4 text-2xl font-bold text-on-surface dark:text-on-primary">Không thể tải dữ liệu ôn tập</h1>
          <p className="mt-2 text-on-surface-variant dark:text-surface-dim">Vui lòng thử lại sau.</p>
        </div>
      )}

      {state.status === 'success' && state.items.length === 0 && (
        <div className="rounded-lg border border-dashed border-outline-variant bg-white p-10 text-center dark:border-outline dark:bg-surface-dark">
          <span className="material-symbols-outlined text-5xl text-secondary">task_alt</span>
          <h1 className="mt-4 text-2xl font-bold text-on-surface dark:text-on-primary">Không có từ nào đến hạn</h1>
          <p className="mt-2 text-on-surface-variant dark:text-surface-dim">Bạn đã ôn tập hết! Quay lại sau nhé.</p>
        </div>
      )}

      {state.status === 'success' && state.items.length > 0 && index >= state.items.length && (
        <div className="rounded-lg border border-dashed border-outline-variant bg-white p-10 text-center dark:border-outline dark:bg-surface-dark">
          <span className="material-symbols-outlined text-5xl text-secondary">celebration</span>
          <h1 className="mt-4 text-2xl font-bold text-on-surface dark:text-on-primary">Hoàn thành!</h1>
          <p className="mt-2 text-on-surface-variant dark:text-surface-dim">Bạn đã ôn tập {ratedCount} từ hôm nay.</p>
        </div>
      )}

      {state.status === 'success' && state.items.length > 0 && index < state.items.length && (
        <>
          <button
            onClick={() => setRevealed((value) => !value)}
            className="flex min-h-[320px] w-full flex-col items-center justify-center rounded-lg border border-outline-variant bg-white p-5 text-center shadow-[0_12px_36px_-24px_rgba(15,23,42,0.55)] sm:p-8 dark:border-outline dark:bg-surface-dark"
          >
            <span className="text-sm uppercase tracking-wider text-on-surface-variant dark:text-surface-dim">
              Từ vựng
            </span>
            <h1 className="mt-6 text-3xl font-bold text-primary dark:text-primary-fixed-dim sm:text-4xl">
              {state.items[index].word}
            </h1>
            {!revealed ? (
              <p className="mt-20 text-on-surface-variant dark:text-surface-dim">Chạm để xem ví dụ</p>
            ) : state.items[index].context_sentences.length > 0 ? (
              <p className="mt-8 max-w-[28rem] text-lg leading-8 text-on-surface-variant dark:text-surface-dim">
                &ldquo;{state.items[index].context_sentences[0]}&rdquo;
              </p>
            ) : (
              <p className="mt-8 text-lg leading-8 text-on-surface-variant dark:text-surface-dim">
                Chưa có câu ví dụ cho từ này.
              </p>
            )}
          </button>

          {revealed && (
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {RATING_OPTIONS.map((option) => (
                <button
                  key={option.quality}
                  disabled={submitting}
                  onClick={() => submitRating(state.items[index], option.quality)}
                  className={`rounded-lg px-4 py-3 font-bold transition-colors disabled:opacity-50 ${option.tone}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

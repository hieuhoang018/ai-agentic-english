'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { ReviewCenterBundle } from '@/lib/api/types'
import type { ConversationDetail } from '../../../_types/speaking-history'
import { buildConversationDetail } from '../../../_lib/speaking-history'
import TranscriptThread from '../../../_components/TranscriptThread'
import FeedbackInsightCard from '../../../_components/FeedbackInsightCard'

type LoadState =
  | { status: 'loading' }
  | { status: 'success'; conversation: ConversationDetail | null }
  | { status: 'error' }

const SEVERITY_LABEL: Record<number, string> = {
  1: 'Nhẹ',
  2: 'Vừa',
  3: 'Nghiêm trọng',
}

export default function TranscriptPage() {
  const params = useParams<{ conversationId: string }>()
  const conversationId = params.conversationId
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    fetch('/api/review-center')
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed with ${res.status}`)
        return res.json() as Promise<ReviewCenterBundle>
      })
      .then((bundle) => setState({ status: 'success', conversation: buildConversationDetail(bundle, conversationId) }))
      .catch(() => setState({ status: 'error' }))
  }, [conversationId])

  if (state.status === 'loading') {
    return <p className="text-center text-on-surface-variant">Đang tải dữ liệu...</p>
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center">
        <span className="material-symbols-outlined text-5xl text-error">error</span>
        <h2 className="mt-4 text-xl font-bold text-on-surface">Không thể tải dữ liệu</h2>
        <p className="mt-2 text-on-surface-variant">Vui lòng thử lại sau.</p>
      </div>
    )
  }

  const { conversation } = state
  if (!conversation) {
    return (
      <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center text-on-surface-variant">
        Không tìm thấy cuộc hội thoại này.
      </div>
    )
  }

  function handleTitleSaved(title: string) {
    setState((current) =>
      current.status === 'success' && current.conversation
        ? { ...current, conversation: { ...current.conversation, title } }
        : current,
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <TranscriptThread conversation={conversation} onTitleSaved={handleTitleSaved} />

      <aside className="space-y-4">
        <section className="rounded-lg border border-outline-variant/70 bg-surface-container-lowest p-6">
          <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold text-on-surface">
            <span className="material-symbols-outlined text-primary">rule</span>
            Lỗi ghi nhận
          </h2>
          {conversation.errors.length === 0 ? (
            <p className="text-on-surface-variant">Không phát hiện lỗi nào trong buổi học này.</p>
          ) : (
            <div className="space-y-4">
              {conversation.errors.map((error) => (
                <FeedbackInsightCard
                  key={error.id}
                  title={`${error.errorType} (${SEVERITY_LABEL[error.severity] ?? error.severity})`}
                  issue={error.contextExcerpt ?? 'Không có trích dẫn ngữ cảnh.'}
                />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg bg-primary p-6 text-center text-white shadow-[0_8px_28px_-18px_rgba(15,98,254,0.8)]">
          <span className="material-symbols-outlined text-4xl">school</span>
          <h2 className="mt-3 text-2xl font-bold">Biến lỗi sai thành vốn từ vựng đỉnh cao</h2>
          <p className="mt-3 leading-7">Truy cập Trung tâm ôn luyện để xem lại các lỗi sai và từ vựng mới.</p>
          <Link href="/main/review-center" className="mt-5 flex h-10 items-center justify-center rounded-lg bg-white px-4 text-sm font-bold text-primary">
            Ôn tập ngay
          </Link>
        </section>
      </aside>
    </div>
  )
}

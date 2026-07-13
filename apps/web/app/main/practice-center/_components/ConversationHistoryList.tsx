'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { ReviewCenterBundle } from '@/lib/api/types'
import type { ConversationSummary } from '../_types/speaking-history'
import { buildConversationSummaries } from '../_lib/speaking-history'
import { transcriptPath } from '../_utils/routes'
import EditableConversationTitle from './EditableConversationTitle'

type LoadState =
  | { status: 'loading' }
  | { status: 'success'; conversations: ConversationSummary[] }
  | { status: 'error' }

function dateGroupLabel(date: string) {
  const today = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  if (date === today) return `HÔM NAY - ${date}`
  if (date === yesterday) return `HÔM QUA - ${date}`
  return date
}

export default function ConversationHistoryList() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch('/api/review-center')
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed with ${res.status}`)
        return res.json() as Promise<ReviewCenterBundle>
      })
      .then((bundle) => setState({ status: 'success', conversations: buildConversationSummaries(bundle) }))
      .catch(() => setState({ status: 'error' }))
  }, [])

  const filtered = useMemo(() => {
    if (state.status !== 'success') return []
    const needle = query.toLowerCase()
    return state.conversations.filter(
      (conversation) =>
        conversation.preview.toLowerCase().includes(needle) || (conversation.title ?? '').toLowerCase().includes(needle),
    )
  }, [state, query])

  function handleTitleSaved(conversationId: string, title: string) {
    setState((current) =>
      current.status === 'success'
        ? {
            ...current,
            conversations: current.conversations.map((conversation) =>
              conversation.id === conversationId ? { ...conversation, title } : conversation,
            ),
          }
        : current,
    )
  }

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, ConversationSummary[]>>((acc, conversation) => {
      const label = dateGroupLabel(conversation.date)
      acc[label] = [...(acc[label] ?? []), conversation]
      return acc
    }, {})
  }, [filtered])

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold text-on-surface dark:text-on-primary sm:text-4xl">Lịch sử hội thoại</h1>
        <div className="flex h-11 w-full items-center gap-2 rounded-lg border border-outline-variant bg-white px-3 dark:border-outline dark:bg-surface-dark-high md:w-80">
          <span className="material-symbols-outlined text-on-surface-variant dark:text-surface-dim">search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 outline-none dark:text-on-primary dark:placeholder:text-surface-dim" placeholder="Tìm kiếm hội thoại..." />
        </div>
      </div>

      {state.status === 'loading' && <p className="text-center text-on-surface-variant dark:text-surface-dim">Đang tải dữ liệu...</p>}

      {state.status === 'error' && (
        <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center dark:border-outline dark:bg-surface-dark">
          <span className="material-symbols-outlined text-5xl text-error dark:text-red-400">error</span>
          <h2 className="mt-4 text-xl font-bold text-on-surface dark:text-on-primary">Không thể tải dữ liệu</h2>
          <p className="mt-2 text-on-surface-variant dark:text-surface-dim">Vui lòng thử lại sau.</p>
        </div>
      )}

      {state.status === 'success' && (
        <>
          <div className="space-y-10">
            {Object.entries(grouped).map(([dateLabel, rows]) => (
              <section key={dateLabel}>
                <div className="mb-5 flex items-center gap-5">
                  <h2 className="shrink-0 text-base font-bold text-on-surface dark:text-on-primary">{dateLabel}</h2>
                  <div className="h-px flex-1 bg-outline-variant dark:bg-outline" />
                </div>
                <div className="space-y-4 border-l border-outline-variant pl-5 dark:border-outline sm:pl-8">
                  {rows.map((conversation) => (
                    <article key={conversation.id} className="relative rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-4 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.45)] dark:border-outline/60 dark:bg-surface-dark">
                      <span className="absolute -left-[26px] top-7 h-3 w-3 rounded-full border-4 border-background bg-primary dark:border-surface-dark sm:-left-[38px]" />
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <EditableConversationTitle
                              conversationId={conversation.id}
                              title={conversation.title}
                              fallback={conversation.preview}
                              onSaved={(title) => handleTitleSaved(conversation.id, title)}
                              textClassName="text-lg font-semibold text-on-surface dark:text-on-primary"
                            />
                            {conversation.errorCount > 0 ? (
                              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-error dark:text-red-400 dark:bg-red-900/30">
                                {conversation.errorCount} lỗi ghi nhận
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-[#007a4d] dark:bg-emerald-900/30 dark:text-emerald-300">Không có lỗi</span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-on-surface-variant dark:text-surface-dim">
                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-base">schedule</span>{conversation.time}</span>
                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-base">timer</span>{conversation.durationMinutes} phút</span>
                          </div>
                        </div>
                        <Link href={transcriptPath(conversation.id)} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-5 text-sm font-semibold text-white hover:bg-[#0047bb]">
                          Xem chi tiết
                          <span className="material-symbols-outlined text-base">chevron_right</span>
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
            {filtered.length === 0 ? (
              <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-8 text-center text-on-surface-variant dark:border-outline dark:bg-surface-dark dark:text-surface-dim">
                Không tìm thấy cuộc hội thoại phù hợp.
              </div>
            ) : null}
          </div>

          <footer className="mt-10 border-t border-outline-variant pt-6 dark:border-outline">
            <p className="text-on-surface-variant dark:text-surface-dim">Hiển thị {filtered.length} trên {state.conversations.length} cuộc hội thoại</p>
          </footer>
        </>
      )}
    </div>
  )
}

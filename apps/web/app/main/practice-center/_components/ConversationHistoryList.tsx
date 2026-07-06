"use client"

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { ConversationStatus, ConversationSummary } from '../_types/speaking'
import { transcriptPath } from '../_utils/routes'

type ConversationHistoryListProps = {
  conversations: ConversationSummary[]
}

const statusLabel: Record<ConversationStatus, string> = {
  perfect: 'PERFECT',
  complete: 'COMPLETE',
  needsWork: 'NEEDS WORK',
}

const statusClass: Record<ConversationStatus, string> = {
  perfect: 'bg-emerald-100 text-[#007a4d]',
  complete: 'bg-blue-100 text-[#0b3aa9]',
  needsWork: 'bg-red-100 text-error',
}

export default function ConversationHistoryList({ conversations }: ConversationHistoryListProps) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(
    () => conversations.filter((conversation) => conversation.title.toLowerCase().includes(query.toLowerCase())),
    [conversations, query],
  )
  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, ConversationSummary[]>>((acc, conversation) => {
      const label = conversation.date === '24/05/2024' ? 'HÔM NAY - 24/05/2024' : conversation.date === '23/05/2024' ? 'HÔM QUA - 23/05/2024' : conversation.date
      acc[label] = [...(acc[label] ?? []), conversation]
      return acc
    }, {})
  }, [filtered])

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold text-on-surface sm:text-4xl">Lịch sử hội thoại</h1>
        <div className="flex h-11 w-full items-center gap-2 rounded-lg border border-outline-variant bg-white px-3 md:w-80">
          <span className="material-symbols-outlined text-on-surface-variant">search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 outline-none" placeholder="Tìm kiếm hội thoại..." />
        </div>
      </div>

      <div className="space-y-10">
        {Object.entries(grouped).map(([dateLabel, rows]) => (
          <section key={dateLabel}>
            <div className="mb-5 flex items-center gap-5">
              <h2 className="shrink-0 text-base font-bold text-on-surface">{dateLabel}</h2>
              <div className="h-px flex-1 bg-outline-variant" />
            </div>
            <div className="space-y-4 border-l border-outline-variant pl-5 sm:pl-8">
              {rows.map((conversation) => (
                <article key={conversation.id} className="relative rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-4 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.45)]">
                  <span className="absolute -left-[26px] top-7 h-3 w-3 rounded-full border-4 border-background bg-primary sm:-left-[38px]" />
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-bold text-on-surface">{conversation.title}</h3>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass[conversation.status]}`}>{statusLabel[conversation.status]}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-on-surface-variant">
                        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-base">schedule</span>{conversation.time}</span>
                        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-base">timer</span>{conversation.durationMinutes} phút</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container" aria-label="Chỉnh sửa">
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                      <button className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container" aria-label="Tải xuống">
                        <span className="material-symbols-outlined">download</span>
                      </button>
                      <Link href={transcriptPath(conversation.id)} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-5 text-sm font-semibold text-white hover:bg-[#0047bb] sm:flex-none">
                        Xem chi tiết
                        <span className="material-symbols-outlined text-base">chevron_right</span>
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-8 text-center text-on-surface-variant">
            Không tìm thấy cuộc hội thoại phù hợp.
          </div>
        ) : null}
      </div>

      <footer className="mt-10 flex flex-col gap-4 border-t border-outline-variant pt-6 md:flex-row md:items-center md:justify-between">
        <p className="text-on-surface-variant">Hiển thị {filtered.length} trên {conversations.length} cuộc hội thoại</p>
        <div className="flex flex-wrap items-center gap-2">
          {['chevron_left', '1', '2', '3', '...', '12', 'chevron_right'].map((item, index) => (
            <button key={`${item}-${index}`} className={`flex h-10 min-w-10 items-center justify-center rounded-lg border border-outline-variant px-3 text-sm font-semibold ${item === '1' ? 'bg-primary text-white' : 'bg-white text-on-surface'}`}>
              {item.includes('chevron') ? <span className="material-symbols-outlined text-base">{item}</span> : item}
            </button>
          ))}
        </div>
      </footer>
    </div>
  )
}

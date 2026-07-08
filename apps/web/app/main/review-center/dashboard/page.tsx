'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import type { ReviewCenterBundle } from '@/lib/api/types'
import { reviewCenterPath } from '../_utils/review-routes'

type LoadState =
  | { status: 'loading' }
  | { status: 'success'; bundle: ReviewCenterBundle }
  | { status: 'error' }

const SKILL_LABELS: Record<string, string> = {
  LISTENING: 'Nghe',
  SPEAKING: 'Nói',
  READING: 'Đọc',
  WRITING: 'Viết',
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDuration(start: string, end: string | null) {
  if (!end) return 'Đang diễn ra'
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
  return `${minutes} phút`
}

function severityTone(severity: number) {
  if (severity >= 3) return 'bg-error'
  if (severity === 2) return 'bg-orange-500'
  return 'bg-secondary'
}

export default function ReviewDashboardPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [expandedConversationId, setExpandedConversationId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/review-center')
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed with ${res.status}`)
        return res.json() as Promise<ReviewCenterBundle>
      })
      .then((bundle) => setState({ status: 'success', bundle }))
      .catch(() => setState({ status: 'error' }))
  }, [])

  const errorsBySkill = useMemo(() => {
    if (state.status !== 'success') return {}
    return state.bundle.errors.reduce<Record<string, typeof state.bundle.errors>>((acc, error) => {
      const key = error.skill_domain
      acc[key] = acc[key] ? [...acc[key], error] : [error]
      return acc
    }, {})
  }, [state])

  return (
    <div className="mx-auto max-w-4xl pt-6 sm:pt-16">
      <div className="mb-7">
        <Link href={reviewCenterPath} className="text-sm text-on-surface-variant hover:text-primary">
          &larr; Quay lại Trung tâm ôn luyện
        </Link>
        <h1 className="mt-3 text-3xl font-bold text-on-surface">Nhật ký học tập</h1>
        <p className="mt-2 text-on-surface-variant">Lỗi thường gặp, từ vựng, lịch sử buổi học và hội thoại đã lưu.</p>
      </div>

      {state.status === 'loading' && (
        <p className="text-center text-on-surface-variant">Đang tải dữ liệu...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-lg border border-dashed border-outline-variant bg-white p-10 text-center">
          <span className="material-symbols-outlined text-5xl text-error">error</span>
          <h2 className="mt-4 text-xl font-bold text-on-surface">Không thể tải dữ liệu</h2>
          <p className="mt-2 text-on-surface-variant">Vui lòng thử lại sau.</p>
        </div>
      )}

      {state.status === 'success' && (
        <div className="space-y-10">
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-on-surface">
              <span className="material-symbols-outlined text-primary">rule</span>
              Lỗi thường gặp
            </h2>
            {Object.keys(errorsBySkill).length === 0 ? (
              <p className="text-on-surface-variant">Chưa có dữ liệu lỗi nào được ghi nhận.</p>
            ) : (
              <div className="space-y-6">
                {Object.entries(errorsBySkill).map(([skill, errors]) => (
                  <div key={skill}>
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                      {SKILL_LABELS[skill] ?? skill}
                    </h3>
                    <ul className="space-y-2">
                      {errors.map((error) => (
                        <li
                          key={error.event_id}
                          className="flex items-start gap-3 rounded-lg border border-outline-variant/50 bg-white p-3"
                        >
                          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${severityTone(error.severity)}`} />
                          <div>
                            <p className="font-semibold text-on-surface">{error.error_type}</p>
                            {error.context_excerpt ? (
                              <p className="mt-1 text-sm text-on-surface-variant">{error.context_excerpt}</p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-on-surface">
              <span className="material-symbols-outlined text-primary">style</span>
              Từ vựng đã học
            </h2>
            {state.bundle.vocabulary.length === 0 ? (
              <p className="text-on-surface-variant">Chưa có từ vựng nào được ghi nhận.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {state.bundle.vocabulary.map((item) => (
                  <li key={item.vocab_id} className="rounded-lg border border-outline-variant/50 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-on-surface">{item.word}</p>
                      <span className="text-xs text-on-surface-variant">{item.encounter_count} lần gặp</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-outline-variant/40">
                      <div
                        className="h-full rounded-full bg-secondary"
                        style={{ width: `${Math.round(Math.min(1, Math.max(0, item.sm_retrievability)) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-on-surface">
              <span className="material-symbols-outlined text-primary">event_available</span>
              Lịch sử buổi học
            </h2>
            {state.bundle.sessions.length === 0 ? (
              <p className="text-on-surface-variant">Chưa có buổi học nào được ghi nhận.</p>
            ) : (
              <ul className="space-y-2">
                {state.bundle.sessions.map((session) => (
                  <li
                    key={session.session_id}
                    className="flex items-center justify-between rounded-lg border border-outline-variant/50 bg-white p-3"
                  >
                    <div>
                      <p className="font-semibold text-on-surface">{formatDate(session.start_time)}</p>
                      <p className="text-sm text-on-surface-variant">{SKILL_LABELS[session.skill_focus] ?? session.skill_focus}</p>
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      {formatDuration(session.start_time, session.end_time)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-on-surface">
              <span className="material-symbols-outlined text-primary">forum</span>
              Hội thoại đã lưu
            </h2>
            {state.bundle.conversations.length === 0 ? (
              <p className="text-on-surface-variant">Chưa có hội thoại nào được lưu lại.</p>
            ) : (
              <ul className="space-y-2">
                {state.bundle.conversations.map((conversation) => {
                  const expanded = expandedConversationId === conversation.conv_id
                  return (
                    <li key={conversation.conv_id} className="rounded-lg border border-outline-variant/50 bg-white p-3">
                      <button
                        type="button"
                        onClick={() => setExpandedConversationId(expanded ? null : conversation.conv_id)}
                        className="flex w-full items-center justify-between text-left"
                      >
                        <span className="font-semibold text-on-surface">{formatDate(conversation.created_at)}</span>
                        <span className="material-symbols-outlined text-on-surface-variant">
                          {expanded ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>
                      {expanded ? (
                        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-sm text-on-surface-variant">
                          {JSON.stringify(conversation.transcript, null, 2)}
                        </pre>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

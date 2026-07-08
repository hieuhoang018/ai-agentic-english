"use client"

import { useState, type FormEvent } from 'react'

import { useSpeakingRealtimeSession } from '../_hooks/useSpeakingRealtimeSession'
import type { ConversationDetail } from '../_types/speaking'
import type { SpeakingRealtimeStatus } from '../_types/speaking-realtime'

type SpeakingChatProps = {
  session: ConversationDetail
}

const statusLabels: Record<SpeakingRealtimeStatus, string> = {
  idle: 'Chưa bắt đầu',
  connecting: 'Đang kết nối...',
  ready: 'Sẵn sàng',
  recording: 'Đang ghi âm...',
  sending: 'Đang xử lý...',
  receiving: 'Đang xử lý...',
  ending: 'Đang kết thúc...',
  ended: 'Đã kết thúc',
  error: 'Có lỗi kết nối',
}

function getStatusClassName(status: SpeakingRealtimeStatus) {
  if (status === 'error') return 'text-error'
  if (status === 'recording') return 'text-tertiary'
  if (status === 'ending' || status === 'ended') return 'text-on-surface-variant'
  return 'text-secondary'
}

export default function SpeakingChat({ session }: SpeakingChatProps) {
  const [draft, setDraft] = useState('')
  const {
    status,
    messages,
    error,
    isRecording,
    canSendTurn,
    sendText,
    startRecording,
    stopRecording,
    endSession,
  } = useSpeakingRealtimeSession()

  const isBusy = status === 'connecting' || status === 'sending' || status === 'receiving' || status === 'ending'
  const isSessionClosed = status === 'ended' || status === 'error'
  const canSendText = canSendTurn && draft.trim().length > 0
  const canUseMic = status === 'recording' || (!isBusy && !isSessionClosed && canSendTurn)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSendText) return

    sendText(draft)
    setDraft('')
  }

  function handleMicClick() {
    if (!canUseMic) return

    if (isRecording) {
      stopRecording()
      return
    }

    void startRecording()
  }

  return (
    <section className="flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-outline-variant/70 bg-surface-container-lowest sm:min-h-[620px]">
      <header className="flex flex-col gap-4 border-b border-outline-variant/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white">
            <span className="material-symbols-outlined">smart_toy</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-on-surface sm:text-2xl">Wise Mentor AI</h2>
            <p className={`flex items-center gap-1 text-sm font-semibold ${getStatusClassName(status)}`}>
              <span
                className={`h-2 w-2 rounded-full ${
                  status === 'error' ? 'bg-error' : status === 'recording' ? 'bg-tertiary' : 'bg-current'
                }`}
              />
              {statusLabels[status]}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={endSession}
          disabled={status === 'ending' || status === 'ended'}
          className="flex h-10 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-white px-4 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-base">stop_circle</span>
          Kết thúc
        </button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto bg-[#f7f8fd] p-4 sm:p-6">
        <div className="flex justify-center">
          <span className="rounded-full bg-surface-container-high px-4 py-1 text-xs text-on-surface-variant">
            Chủ đề: {session.topic}
          </span>
        </div>

        {messages.map((message) => {
          const isUser = message.speaker === 'user'
          const messageContent =
            !isUser && message.isSpeaking ? (message.displayContent ?? '') : message.content
          const detectedIssues =
            typeof message.grammarFeedback?.total_errors_detected === 'number'
              ? message.grammarFeedback.total_errors_detected
              : 0

          return (
            <div key={message.id} className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser ? (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                  <span className="material-symbols-outlined text-lg">smart_toy</span>
                </div>
              ) : null}
              <div className={`max-w-[86%] sm:max-w-[78%] ${isUser ? 'text-right' : ''}`}>
                <div
                  className={`min-h-7 rounded-lg px-4 py-3 text-left leading-7 shadow-sm ${
                    isUser ? 'bg-primary text-white' : 'border border-outline-variant bg-white text-on-surface'
                  }`}
                >
                  {messageContent}
                </div>
                <div
                  className={`mt-1 flex items-center gap-2 text-xs ${
                    isUser ? 'justify-end text-secondary' : 'text-on-surface-variant'
                  }`}
                >
                  {message.pendingTranscript ? <span className="font-semibold">Đang nhận diện giọng nói...</span> : null}
                  <span>{message.timestamp}</span>
                </div>
                {isUser && (message.mockFeedback || detectedIssues > 0) ? (
                  <div className="mt-2 space-y-2 text-left">
                    {message.mockFeedback ? (
                      <div className="rounded-lg border border-outline-variant bg-white px-3 py-2 text-xs leading-5 text-on-surface-variant">
                        {message.mockFeedback}
                      </div>
                    ) : null}
                    {detectedIssues > 0 ? (
                      <div className="rounded-lg border border-error-container bg-error-container px-3 py-2 text-xs font-semibold leading-5 text-on-error-container">
                        Detected {detectedIssues} issue(s)
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {isUser ? (
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-container">
                  <div className="flex h-full w-full items-center justify-center text-sm font-bold text-primary">A</div>
                </div>
              ) : null}
            </div>
          )
        })}

        {messages.length === 0 ? (
          <div className="flex justify-start">
            <div className="max-w-[86%] rounded-lg border border-outline-variant bg-white px-4 py-3 leading-7 text-on-surface-variant shadow-sm sm:max-w-[78%]">
              {error ?? 'Đang mở phiên luyện nói...'}
            </div>
          </div>
        ) : null}

        {isBusy ? (
          <div className="flex justify-start">
            <div className="rounded-lg border border-outline-variant bg-white px-5 py-3 text-on-surface shadow-sm">
              <span className="mr-3 inline-flex gap-1 align-middle">
                <span className="h-2 w-2 rounded-full bg-tertiary" />
                <span className="h-2 w-2 rounded-full bg-tertiary" />
                <span className="h-2 w-2 rounded-full bg-tertiary" />
              </span>
              {statusLabels[status]}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex justify-center">
            <div className="max-w-xl rounded-lg border border-error-container bg-error-container px-4 py-3 text-sm font-semibold text-on-error-container">
              {error}
            </div>
          </div>
        ) : null}

        {isRecording ? (
          <div className="flex justify-end">
            <div className="rounded-lg bg-primary px-5 py-3 text-white shadow-sm">
              <span className="mr-3 inline-flex gap-1 align-middle">
                <span className="h-2 w-2 rounded-full bg-tertiary" />
                <span className="h-2 w-2 rounded-full bg-tertiary" />
                <span className="h-2 w-2 rounded-full bg-tertiary" />
              </span>
              Listening...
            </div>
          </div>
        ) : null}
      </div>

      <footer className="border-t border-outline-variant/70 p-4">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 sm:gap-3">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={isBusy || isSessionClosed || isRecording}
            className="h-12 min-w-0 flex-1 rounded-lg border border-outline-variant bg-white px-4 text-base outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="Type or speak your reply..."
          />
          <button
            type="submit"
            disabled={!canSendText}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-colors hover:bg-[#0047bb] disabled:cursor-not-allowed disabled:bg-outline disabled:opacity-60"
            aria-label="Gửi tin nhắn"
          >
            <span className="material-symbols-outlined">send</span>
          </button>
          <button
            type="button"
            onClick={handleMicClick}
            disabled={!canUseMic}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:h-14 sm:w-14 ${
              isRecording ? 'bg-tertiary' : 'bg-primary hover:bg-[#0047bb]'
            }`}
            aria-label="Ghi âm"
          >
            <span className="material-symbols-outlined">{isRecording ? 'stop' : 'mic'}</span>
          </button>
        </form>
        <div className="mt-3 flex items-center justify-between text-sm text-on-surface-variant">
          <span className={isRecording ? 'text-tertiary' : ''}>• {statusLabels[status]}</span>
          <span>{messages.length} message(s)</span>
        </div>
      </footer>
    </section>
  )
}

"use client"

import { useState } from 'react'
import type { ConversationDetail } from '../_types/speaking'

type SpeakingChatProps = {
  session: ConversationDetail
}

export default function SpeakingChat({ session }: SpeakingChatProps) {
  const [draft, setDraft] = useState('')
  const [isRecording, setIsRecording] = useState(true)

  return (
    <section className="flex min-h-[620px] flex-col overflow-hidden rounded-lg border border-outline-variant/70 bg-surface-container-lowest">
      <header className="flex items-center gap-4 border-b border-outline-variant/70 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white">
          <span className="material-symbols-outlined">smart_toy</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-on-surface">Wise Mentor AI</h2>
          <p className="flex items-center gap-1 text-sm font-semibold text-secondary">
            <span className="h-2 w-2 rounded-full bg-secondary" />
            Sẵn sàng
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto bg-[#f7f8fd] p-6">
        <div className="flex justify-center">
          <span className="rounded-full bg-surface-container-high px-4 py-1 text-xs text-on-surface-variant">Chủ đề: {session.topic}</span>
        </div>

        {session.messages.map((message) => {
          const isUser = message.speaker === 'user'
          return (
            <div key={message.id} className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser ? (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                  <span className="material-symbols-outlined text-lg">smart_toy</span>
                </div>
              ) : null}
              <div className={`max-w-[78%] ${isUser ? 'text-right' : ''}`}>
                <div className={`rounded-lg px-4 py-3 text-left leading-7 shadow-sm ${isUser ? 'bg-primary text-white' : 'border border-outline-variant bg-white text-on-surface'}`}>
                  {message.content}
                </div>
                <div className={`mt-1 flex items-center gap-2 text-xs ${isUser ? 'justify-end text-secondary' : 'text-on-surface-variant'}`}>
                  {message.note ? <span className="font-semibold">{message.note}</span> : null}
                  {message.timestamp ? <span>{message.timestamp}</span> : null}
                </div>
              </div>
              {isUser ? (
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-container">
                  <div className="flex h-full w-full items-center justify-center text-sm font-bold text-primary">A</div>
                </div>
              ) : null}
            </div>
          )
        })}

        <div className="flex justify-end">
          <div className="rounded-lg bg-primary px-5 py-3 text-on-surface shadow-sm">
            <span className="mr-3 inline-flex gap-1 align-middle">
              <span className="h-2 w-2 rounded-full bg-tertiary" />
              <span className="h-2 w-2 rounded-full bg-tertiary" />
              <span className="h-2 w-2 rounded-full bg-tertiary" />
            </span>
            Listening...
          </div>
        </div>
      </div>

      <footer className="border-t border-outline-variant/70 p-4">
        <div className="flex items-center gap-3">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="h-12 min-w-0 flex-1 rounded-lg border border-outline-variant bg-white px-4 text-base outline-none focus:border-primary"
            placeholder="Type or speak your reply..."
          />
          <button className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-colors hover:bg-[#0047bb]" aria-label="Gửi tin nhắn">
            <span className="material-symbols-outlined">send</span>
          </button>
          <button
            type="button"
            onClick={() => setIsRecording((value) => !value)}
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition-colors ${isRecording ? 'bg-primary' : 'bg-outline'}`}
            aria-label="Ghi âm"
          >
            <span className="material-symbols-outlined">mic</span>
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-on-surface-variant">
          <span className={isRecording ? 'text-tertiary' : ''}>• {isRecording ? 'Recording...' : 'Paused'}</span>
          <span>00:12 / 01:00</span>
        </div>
      </footer>
    </section>
  )
}

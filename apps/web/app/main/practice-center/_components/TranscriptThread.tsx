import type { ConversationDetail } from '../_types/speaking'
import FeedbackInsightCard from './FeedbackInsightCard'

type TranscriptThreadProps = {
  conversation: ConversationDetail
}

export default function TranscriptThread({ conversation }: TranscriptThreadProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-outline-variant/70 bg-surface-container-lowest">
      <header className="flex flex-col gap-3 border-b border-outline-variant/70 p-5 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{conversation.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-on-surface-variant">
            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-base">calendar_today</span>{conversation.date}</span>
            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-base">timer</span>{conversation.durationMinutes} phút</span>
          </div>
        </div>
        <span className="inline-flex h-8 items-center justify-center rounded-full bg-emerald-100 px-4 text-sm font-bold text-[#007a4d]">
          {conversation.accuracyPercent}% Accuracy
        </span>
      </header>

      <div className="space-y-6 p-6">
        {conversation.messages.map((message) => {
          const isUser = message.speaker === 'user'
          return (
            <div key={message.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser ? (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                  <span className="material-symbols-outlined">smart_toy</span>
                </div>
              ) : null}
              <div className={`max-w-[78%] space-y-3 ${isUser ? 'text-right' : ''}`}>
                {message.note ? <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-[#007a4d]">{message.note}</span> : null}
                <div className={`rounded-lg border px-4 py-3 text-left leading-7 ${isUser ? 'border-blue-200 bg-blue-100 text-[#0b235a]' : 'border-outline-variant bg-white text-on-surface'}`}>
                  {message.content}
                </div>
                {message.correction ? (
                  <FeedbackInsightCard title={message.correction.title} issue={message.correction.issue} suggestion={message.correction.suggestion} />
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

import type { ConversationDetail } from '../_types/speaking-history'
import EditableConversationTitle from './EditableConversationTitle'

type TranscriptThreadProps = {
  conversation: ConversationDetail
  onTitleSaved: (title: string) => void
}

export default function TranscriptThread({ conversation, onTitleSaved }: TranscriptThreadProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-outline-variant/70 bg-surface-container-lowest dark:border-outline/70 dark:bg-surface-dark">
      <header className="flex flex-col gap-3 border-b border-outline-variant/70 p-5 md:flex-row md:items-start md:justify-between dark:border-outline/70">
        <div>
          <EditableConversationTitle
            conversationId={conversation.id}
            title={conversation.title}
            fallback="Buổi luyện nói"
            onSaved={onTitleSaved}
            textClassName="text-2xl font-bold text-on-surface dark:text-on-primary"
          />
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-on-surface-variant dark:text-surface-dim">
            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-base">calendar_today</span>{conversation.date} · {conversation.time}</span>
            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-base">timer</span>{conversation.durationMinutes} phút</span>
          </div>
        </div>
      </header>

      <div className="space-y-6 p-4 sm:p-6">
        {conversation.messages.length === 0 ? (
          <p className="text-center text-on-surface-variant dark:text-surface-dim">Không có nội dung hội thoại được lưu lại cho buổi học này.</p>
        ) : (
          conversation.messages.map((message) => {
            const isUser = message.speaker === 'user'
            return (
              <div key={message.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser ? (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                    <span className="material-symbols-outlined">smart_toy</span>
                  </div>
                ) : null}
                <div className={`max-w-[86%] space-y-3 sm:max-w-[78%] ${isUser ? 'text-right' : ''}`}>
                  <div className={`rounded-lg border px-4 py-3 text-left leading-7 ${isUser ? 'border-blue-200 bg-blue-100 text-[#0b235a] dark:border-blue-900/50 dark:bg-blue-900/30 dark:text-on-primary' : 'border-outline-variant bg-white text-on-surface dark:border-outline dark:bg-surface-dark-high dark:text-on-primary'}`}>
                    {message.content}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

import { notFound } from 'next/navigation'
import Link from 'next/link'
import TranscriptThread from '../../../_components/TranscriptThread'
import ProgressBar from '../../../_components/ProgressBar'
import { getConversationDetail } from '../../../_data/speaking-content'

type TranscriptPageProps = {
  params: Promise<{
    conversationId: string
  }>
}

export default async function TranscriptPage({ params }: TranscriptPageProps) {
  const { conversationId } = await params
  const conversation = await getConversationDetail(conversationId)

  if (!conversation) {
    notFound()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <TranscriptThread conversation={conversation} />

      <aside className="space-y-4">
        <section className="rounded-lg border border-outline-variant/70 bg-surface-container-lowest p-6">
          <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold text-on-surface">
            <span className="material-symbols-outlined text-primary">bar_chart</span>
            Phân tích chi tiết
          </h2>
          <div className="space-y-6">
            <div>
              <div className="mb-2 flex justify-between text-sm font-semibold">
                <span>Pronunciation</span>
                <span className="text-secondary">{conversation.analysis.pronunciation}%</span>
              </div>
              <ProgressBar value={conversation.analysis.pronunciation} tone="success" />
            </div>
            <div>
              <div className="mb-2 flex justify-between text-sm font-semibold">
                <span>Vocabulary</span>
                <span className="text-primary">{conversation.analysis.vocabulary}%</span>
              </div>
              <ProgressBar value={conversation.analysis.vocabulary} />
              <p className="mt-2 text-sm leading-6 text-on-surface-variant">{conversation.analysis.vocabularyNote}</p>
            </div>
            <div>
              <div className="mb-2 flex justify-between text-sm font-semibold">
                <span>Grammar</span>
                <span className="text-error">{conversation.analysis.grammar}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-variant">
                <div className="h-full rounded-full bg-error" style={{ width: `${conversation.analysis.grammar}%` }} />
              </div>
              <p className="mt-2 text-sm leading-6 text-on-surface-variant">{conversation.analysis.grammarNote}</p>
            </div>
          </div>
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

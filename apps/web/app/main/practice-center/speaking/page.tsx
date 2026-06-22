import Link from 'next/link'
import SpeakingChat from '../_components/SpeakingChat'
import SpeakingSidebar from '../_components/SpeakingSidebar'
import { getCurrentSpeakingSession } from '../_data/speaking-content'
import { speakingHistoryPath } from '../_utils/routes'

export default async function SpeakingPage() {
  const session = await getCurrentSpeakingSession()

  return (
    <div>
      <div className="mb-1 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-4xl font-bold text-on-surface">Hội thoại với AI</h1>
        <Link href={speakingHistoryPath()} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-white px-4 text-sm font-semibold text-on-surface hover:bg-surface-container">
          <span className="material-symbols-outlined text-base">history</span>
          Lịch sử hội thoại
        </Link>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SpeakingChat session={session} />
        <SpeakingSidebar goals={session.goals} vocabularySuggestions={session.vocabularySuggestions} />
      </div>
    </div>
  )
}

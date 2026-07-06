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
        <h1 className="text-3xl font-bold text-on-surface sm:text-4xl">Hội thoại với AI</h1>
        <Link href={speakingHistoryPath()} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-outline-variant bg-white px-4 text-sm font-semibold text-on-surface hover:bg-surface-container sm:w-auto">
          <span className="material-symbols-outlined text-base">history</span>
          Lịch sử hội thoại
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-0">
        <SpeakingChat session={session} />
        <SpeakingSidebar goals={session.goals} vocabularySuggestions={session.vocabularySuggestions} />
      </div>
    </div>
  )
}

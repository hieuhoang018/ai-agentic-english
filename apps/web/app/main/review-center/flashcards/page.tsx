import Link from 'next/link'
import FlashcardTopicGrid from '../_components/FlashcardTopicGrid'
import ReviewHero from '../_components/ReviewHero'
import { getFlashcardTopics } from '../_data/review-content'

export default function FlashcardsPage() {
  const topics = getFlashcardTopics()

  return (
    <div>
      <ReviewHero
        title="Flashcard theo chủ đề"
        description="Chọn một chủ đề để bắt đầu ôn tập từ vựng ngay hôm nay."
        action={<Link href="/main/review-center/flashcards/technology" className="flex h-11 items-center gap-2 rounded-lg bg-primary px-5 font-bold text-white"><span className="material-symbols-outlined">add</span>Tạo chủ đề mới</Link>}
      />
      <FlashcardTopicGrid topics={topics} />
    </div>
  )
}

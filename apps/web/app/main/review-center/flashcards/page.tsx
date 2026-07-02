import ReviewEmptyState from '../_components/ReviewEmptyState'
import FlashcardTopicGrid from '../_components/FlashcardTopicGrid'
import ReviewHero from '../_components/ReviewHero'
import { getReviewFlashcardTopics } from '../_lib/review-api'

export const dynamic = 'force-dynamic'

export default async function FlashcardsPage() {
  const topics = await getReviewFlashcardTopics()

  return (
    <div>
      <ReviewHero
        title="Flashcard theo chu de"
        description="Chon mot cap do CEFR de bat dau on tap tu vung tu du lieu hoc lieu."
      />
      {topics.length > 0 ? (
        <FlashcardTopicGrid topics={topics} />
      ) : (
        <ReviewEmptyState
          icon="style"
          title="No vocabulary topics found"
          description="Start Kong and the learning-materials service, then seed vocab entries and refresh this page to load CEFR-based flashcard topics."
        />
      )}
    </div>
  )
}

import type { FlashcardTopic } from '../_types/review'
import FlashcardTopicCard from './FlashcardTopicCard'

type FlashcardTopicGridProps = {
  topics: FlashcardTopic[]
}

export default function FlashcardTopicGrid({ topics }: FlashcardTopicGridProps) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {topics.map((topic) => <FlashcardTopicCard key={topic.id} topic={topic} />)}
    </div>
  )
}

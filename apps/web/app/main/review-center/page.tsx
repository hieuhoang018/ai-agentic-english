import ReviewFeatureCard from './_components/ReviewFeatureCard'
import ReviewHero from './_components/ReviewHero'
import { flashcardsPath, grammarPath } from './_utils/review-routes'

export default function ReviewCenterPage() {
  return (
    <div>
      <ReviewHero title="Trung tâm ôn luyện" description="Nâng cao kỹ năng của bạn với các phương pháp học tập thông minh." />
      <div className="grid gap-6 lg:grid-cols-2">
        <ReviewFeatureCard href={flashcardsPath()} title="Ôn tập Flashcard" description="Luyện tập từ vựng với thẻ ghi nhớ thông minh" tag="Spaced Repetition" imageTone="bg-linear-to-br from-blue-50 to-blue-100 text-primary" icon="style" />
        <ReviewFeatureCard href={grammarPath()} title="Ôn tập Ngữ pháp" description="Củng cố kiến thức ngữ pháp đã học" tag="Topic-based" imageTone="bg-linear-to-br from-violet-50 to-violet-100 text-tertiary" icon="account_tree" />
      </div>
    </div>
  )
}

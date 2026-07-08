import ReviewFeatureCard from './_components/ReviewFeatureCard'
import ReviewHero from './_components/ReviewHero'
import { dashboardPath, duePath, flashcardsPath, grammarPath } from './_utils/review-routes'

export default function ReviewCenterPage() {
  return (
    <div>
      <ReviewHero title="Trung tâm ôn luyện" description="Nâng cao kỹ năng của bạn với các phương pháp học tập thông minh." />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <ReviewFeatureCard href={duePath()} title="Từ đến hạn ôn tập" description="Ôn lại các từ vựng đến hạn theo lịch lặp lại ngắt quãng cá nhân hóa" tag="SM-2" imageTone="bg-linear-to-br from-emerald-50 to-emerald-100 text-secondary" icon="event_available" />
        <ReviewFeatureCard href={flashcardsPath()} title="Ôn tập Flashcard" description="Luyện tập từ vựng với thẻ ghi nhớ thông minh" tag="Theo chủ đề" imageTone="bg-linear-to-br from-blue-50 to-blue-100 text-primary" icon="style" />
        <ReviewFeatureCard href={grammarPath()} title="Ôn tập Ngữ pháp" description="Củng cố kiến thức ngữ pháp đã học" tag="Topic-based" imageTone="bg-linear-to-br from-violet-50 to-violet-100 text-tertiary" icon="account_tree" />
        <ReviewFeatureCard href={dashboardPath()} title="Nhật ký học tập" description="Xem lại lỗi, từ vựng và lịch sử học tập của bạn" tag="Tổng quan" imageTone="bg-linear-to-br from-amber-50 to-amber-100 text-amber-700" icon="history_edu" />
      </div>
    </div>
  )
}

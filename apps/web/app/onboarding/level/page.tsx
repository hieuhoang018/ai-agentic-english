import ChoiceCard from '../_components/ChoiceCard'
import OnboardingShell from '../_components/OnboardingShell'
import { onboardingRoutes } from '../_utils/onboarding-routes'

export default function LevelPage() {
  return (
    <OnboardingShell step={2} title="Xác định trình độ của bạn" description="Chọn phương pháp đánh giá trình độ hiện tại để Wise Mentor xây dựng lộ trình tối ưu." backHref={onboardingRoutes.goals}>
      <div className="grid max-w-xl gap-4 md:grid-cols-2">
        <a href={onboardingRoutes.assessment}><ChoiceCard title="Làm bài test" description="Đánh giá toàn diện 4 kỹ năng với bài kiểm tra ngắn." icon="quiz" tone="bg-blue-50 text-primary" /></a>
        <a href={onboardingRoutes.selfAssessment}><ChoiceCard title="Tự đánh giá" description="Nhanh chóng thiết lập cấp độ qua thang điểm 0-10." icon="tune" tone="bg-emerald-50 text-secondary" /></a>
      </div>
    </OnboardingShell>
  )
}

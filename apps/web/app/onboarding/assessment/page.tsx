import AssessmentQuestion from '../_components/AssessmentQuestion'
import OnboardingShell from '../_components/OnboardingShell'
import { onboardingRoutes } from '../_utils/onboarding-routes'

export default function AssessmentPage() {
  return (
    <OnboardingShell
      step={2}
      title="Làm bài test trình độ"
      description="Trả lời 4 câu hỏi ngẫu nhiên cho mỗi kỹ năng từ kho học liệu để Wise Mentor ước tính trình độ hiện tại của bạn."
      backHref={onboardingRoutes.level}
      wide
    >
      <AssessmentQuestion />
    </OnboardingShell>
  )
}

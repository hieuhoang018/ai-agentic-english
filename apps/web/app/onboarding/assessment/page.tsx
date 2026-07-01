import AssessmentQuestion from '../_components/AssessmentQuestion'
import OnboardingShell from '../_components/OnboardingShell'
import { onboardingRoutes } from '../_utils/onboarding-routes'

export default function AssessmentPage() {
  return (
    <OnboardingShell
      step={2}
      title="Làm bài test trình độ"
      description="Trả lời bộ câu hỏi đọc, viết và nghe từ kho học liệu để Wise Mentor ước tính trình độ hiện tại của bạn."
      backHref={onboardingRoutes.level}
      wide
    >
      <AssessmentQuestion />
    </OnboardingShell>
  )
}

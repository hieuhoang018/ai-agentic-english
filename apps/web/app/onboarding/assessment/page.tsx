import AssessmentQuestion from '../_components/AssessmentQuestion'
import OnboardingShell from '../_components/OnboardingShell'
import { onboardingRoutes } from '../_utils/onboarding-routes'

export default function AssessmentPage() {
  return (
    <OnboardingShell
      step={2}
      title="Làm bài test trình độ"
      description="Hoàn thành 4 câu hỏi ngắn để Wise Mentor ước tính điểm xuất phát của bạn."
      backHref={onboardingRoutes.level}
      wide
    >
      <AssessmentQuestion />
    </OnboardingShell>
  )
}

import AssessmentQuestion from '../_components/AssessmentQuestion'
import OnboardingShell from '../_components/OnboardingShell'
import { onboardingRoutes } from '../_utils/onboarding-routes'

export default function AssessmentPage() {
  return (
    <OnboardingShell step={2} title="Làm bài test trình độ" backHref={onboardingRoutes.level} nextHref={onboardingRoutes.preferences} nextLabel="Câu sau" wide>
      <AssessmentQuestion />
      <div className="mt-6 rounded-lg bg-violet-100 p-5 text-violet-950">
        <p className="font-bold">Mentor Insight</p>
        <p className="mt-1">Bạn đang giữ nhịp ổn định. Câu này kiểm tra cách dùng động từ quá khứ trong ngữ cảnh công việc.</p>
      </div>
    </OnboardingShell>
  )
}

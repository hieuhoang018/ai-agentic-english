import CompleteOnboardingLink from '../_components/CompleteOnboardingLink'
import GeneratedPlanPreview from '../_components/GeneratedPlanPreview'
import { onboardingRoutes } from '../_utils/onboarding-routes'

export default function GeneratedPlanPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center py-10">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-primary">Hành Trình Của Bạn Bắt Đầu</h1>
        <p className="mt-3 max-w-2xl text-on-surface-variant">Dựa trên đánh giá của bạn, Wise Mentor đã thiết kế một lộ trình học tập cá nhân hóa để giúp bạn đạt mục tiêu nhanh nhất.</p>
      </div>
      <GeneratedPlanPreview />
      <CompleteOnboardingLink href={onboardingRoutes.done} className="mt-8 flex h-14 items-center justify-center rounded-full bg-primary px-10 text-xl font-bold text-white shadow-lg">
        Bắt Đầu Hành Trình
      </CompleteOnboardingLink>
    </div>
  )
}

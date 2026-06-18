import OnboardingShell from '../_components/OnboardingShell'
import SkillSelector from '../_components/SkillSelector'
import TimeCommitmentSlider from '../_components/TimeCommitmentSlider'
import { skills } from '../_data/onboarding-content'
import { onboardingRoutes } from '../_utils/onboarding-routes'

export default function PreferencesPage() {
  return (
    <OnboardingShell step={3} title="Lựa chọn cá nhân hóa" description="Chia sẻ mục tiêu để Wise Mentor thiết kế lộ trình học phù hợp nhất dành riêng cho bạn." backHref={onboardingRoutes.level} nextHref={onboardingRoutes.plan} nextLabel="Bắt đầu đánh giá">
      <section>
        <h2 className="mb-8 flex items-center gap-2 text-lg font-semibold">
          <span className="material-symbols-outlined text-primary">schedule</span>
          Bạn có thể dành bao nhiêu thời gian học mỗi ngày?
        </h2>
        <TimeCommitmentSlider />
      </section>
      <div className="my-10 h-px bg-outline-variant" />
      <section>
        <h2 className="mb-5 flex flex-wrap items-center justify-between gap-2 text-lg font-semibold">
          <span>
            <span className="material-symbols-outlined align-[-5px] text-tertiary">psychology</span> Bạn muốn tập trung cải thiện kỹ năng nào nhất?
          </span>
          <span className="rounded-full bg-surface-container px-3 py-1 text-xs text-on-surface-variant">Có thể chọn nhiều</span>
        </h2>
        <SkillSelector skills={skills} />
      </section>
    </OnboardingShell>
  )
}

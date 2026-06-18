import LevelScale from '../_components/LevelScale'
import OnboardingShell from '../_components/OnboardingShell'
import { onboardingRoutes } from '../_utils/onboarding-routes'

export default function SelfAssessmentPage() {
  return (
    <OnboardingShell
      step={2}
      title="Tự đánh giá năng lực"
      description="Hãy chọn mức độ bạn tự tin nhất với khả năng tiếng Anh hiện tại của mình. Điều này giúp Wise Mentor cá nhân hóa lộ trình học tập tối ưu cho bạn."
      backHref={onboardingRoutes.level}
      nextHref={onboardingRoutes.preferences}
      wide
    >
      <LevelScale />
      <section className="mt-12 grid gap-8 rounded-lg border border-outline-variant bg-surface p-5 md:p-6 lg:grid-cols-[1fr_1.05fr]">
        <div className="flex min-h-64 items-center justify-center rounded-lg bg-linear-to-br from-blue-100 to-emerald-100 text-primary">
          <div className="text-center">
            <span className="material-symbols-outlined text-5xl">psychology</span>
            <p className="mt-3 font-bold">AI Analysis Visualization</p>
          </div>
        </div>
        <div className="flex flex-col justify-center">
          <h2 className="text-2xl font-bold text-on-surface">Vì sao bước này quan trọng?</h2>
          <div className="mt-5 space-y-4 text-on-surface-variant">
            {[
              'Việc trung thực về trình độ hiện tại giúp tránh bài học quá dễ gây nhàm chán hoặc quá khó gây nản lòng.',
              'Bài tập sẽ sát với thực tế và tối ưu hóa thời gian học.',
              'Wise Mentor có thể đề xuất tài liệu thông minh, cá nhân hóa theo tiến độ.',
            ].map((item) => (
              <p key={item} className="flex gap-3 leading-7">
                <span className="material-symbols-outlined mt-0.5 text-secondary">check_circle</span>
                {item}
              </p>
            ))}
          </div>
        </div>
      </section>
    </OnboardingShell>
  )
}

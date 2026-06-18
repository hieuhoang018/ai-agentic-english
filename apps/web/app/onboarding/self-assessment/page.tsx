import LevelScale from '../_components/LevelScale'
import OnboardingShell from '../_components/OnboardingShell'
import { onboardingRoutes } from '../_utils/onboarding-routes'

export default function SelfAssessmentPage() {
  return (
    <OnboardingShell step={2} title="Tự đánh giá năng lực" description="Hãy chọn mức độ bạn tự tin nhất với khả năng tiếng Anh hiện tại của mình." backHref={onboardingRoutes.level} nextHref={onboardingRoutes.preferences} wide>
      <LevelScale />
      <section className="mt-16 grid gap-8 rounded-lg border border-outline-variant bg-surface p-6 lg:grid-cols-2">
        <div className="flex min-h-64 items-center justify-center rounded-lg bg-linear-to-br from-blue-100 to-emerald-100 text-primary">
          <div className="text-center">
            <span className="material-symbols-outlined text-5xl">psychology</span>
            <p className="mt-3 font-bold">AI Analysis Visualization</p>
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-bold">Vì sao bước này quan trọng?</h2>
          <div className="mt-5 space-y-4 text-on-surface-variant">
            {['Không đưa ra bài học quá dễ hoặc quá khó.', 'Bài tập sát thực tế, tối ưu hóa thời gian học.', 'Đề xuất tài liệu thông minh theo tiến độ.'].map((item) => (
              <p key={item} className="flex gap-3"><span className="material-symbols-outlined text-secondary">check_circle</span>{item}</p>
            ))}
          </div>
        </div>
      </section>
    </OnboardingShell>
  )
}

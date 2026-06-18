import OnboardingShell from '../_components/OnboardingShell'
import { onboardingRoutes } from '../_utils/onboarding-routes'

export default function UsernamePage() {
  return (
    <OnboardingShell step={1} title="Tạo username" description="Tên này sẽ được dùng trong hồ sơ học tập và các lời nhắc cá nhân hóa." nextHref={onboardingRoutes.goals}>
      <label className="block max-w-xl">
        <span className="mb-2 block font-semibold text-on-surface">Username</span>
        <input className="h-12 w-full rounded-lg border border-outline-variant bg-white px-4 outline-none focus:border-primary" defaultValue="nguyenvana" />
      </label>
    </OnboardingShell>
  )
}

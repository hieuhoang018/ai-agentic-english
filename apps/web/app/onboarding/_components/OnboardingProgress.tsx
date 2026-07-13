type OnboardingProgressProps = {
  step: number
  total: number
}

export default function OnboardingProgress({ step, total }: OnboardingProgressProps) {
  return (
    <div className="border-b border-outline-variant/60 p-6 dark:border-outline/60">
      <div className="mb-2 flex justify-between text-sm text-on-surface-variant dark:text-surface-dim">
        <span>Thiết lập tài khoản</span>
        <span>Bước {step}/{total}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-container dark:bg-surface-dark-high">
        <div className="h-full rounded-full bg-linear-to-r from-primary via-cyan-500 to-secondary-container" style={{ width: `${Math.round((step / total) * 100)}%` }} />
      </div>
    </div>
  )
}

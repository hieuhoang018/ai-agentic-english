"use client"

import { useOnboarding } from './OnboardingProvider'

export default function TimeCommitmentSlider() {
  const { profile, updateProfile } = useOnboarding()
  const minutes = profile.dailyMinutes ?? 15

  return (
    <div>
      <div className="mb-4 text-center font-bold text-primary dark:text-primary-fixed-dim">{minutes} phút</div>
      <input className="w-full accent-primary" min={5} max={180} step={5} type="range" value={minutes} onChange={(event) => updateProfile({ dailyMinutes: Number(event.target.value) })} />
      <div className="mt-2 flex justify-between text-sm text-on-surface-variant dark:text-surface-dim">
        <span>5 phút</span>
        <span>3+ giờ</span>
      </div>
    </div>
  )
}

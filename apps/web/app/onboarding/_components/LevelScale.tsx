"use client"

import { useOnboarding } from './OnboardingProvider'

export default function LevelScale() {
  const { profile, updateProfile } = useOnboarding()
  const level = profile.levelScore ?? 5

  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <div className="relative flex min-w-[640px] items-center justify-between px-1">
          <div className="absolute left-6 right-6 top-1/2 h-1 -translate-y-1/2 rounded-full bg-outline-variant" />
          <div className="absolute left-6 top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary" style={{ width: `calc((100% - 3rem) * ${level / 10})` }} />
          {Array.from({ length: 11 }, (_, value) => (
            <button
              key={value}
              onClick={() => updateProfile({ levelScore: value })}
              className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-full border-2 font-semibold shadow-sm transition-colors ${
                value <= level ? 'border-primary bg-blue-50 text-primary' : 'border-outline-variant bg-surface text-on-surface'
              } ${value === level ? 'bg-primary !text-white shadow-md' : ''}`}
              aria-label={`Chọn mức ${value}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 text-sm text-on-surface-variant">
        <span>Beginner</span>
        <span className="text-center">Intermediate</span>
        <span className="text-right">Advanced</span>
      </div>
    </div>
  )
}

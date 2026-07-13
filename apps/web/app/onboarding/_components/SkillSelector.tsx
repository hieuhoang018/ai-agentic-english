"use client"

import type { SkillOption } from '../_types/onboarding'
import { useOnboarding } from './OnboardingProvider'

type SkillSelectorProps = {
  skills: SkillOption[]
}

export default function SkillSelector({ skills }: SkillSelectorProps) {
  const { profile, updateProfile } = useOnboarding()
  const selected = profile.prioritySkills ?? []

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {skills.map((skill) => {
        const active = selected.includes(skill.id)
        return (
          <button key={skill.id} onClick={() => updateProfile({ prioritySkills: active ? selected.filter((item) => item !== skill.id) : [...selected, skill.id] })} className={`rounded-lg border p-5 text-center ${active ? 'border-primary bg-violet-50 text-tertiary dark:bg-tertiary-container/10' : 'border-outline-variant bg-white text-on-surface-variant dark:border-outline dark:bg-surface-dark dark:text-surface-dim'}`}>
            <span className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full ${active ? 'bg-tertiary text-white' : 'bg-white border border-outline-variant text-tertiary dark:bg-surface-dark dark:border-outline'}`}><span className="material-symbols-outlined">{skill.icon}</span></span>
            <span className="font-semibold">{skill.label}</span>
          </button>
        )
      })}
    </div>
  )
}

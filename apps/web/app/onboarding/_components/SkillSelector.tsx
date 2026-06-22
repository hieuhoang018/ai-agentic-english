"use client"

import { useState } from 'react'
import type { SkillOption } from '../_types/onboarding'

type SkillSelectorProps = {
  skills: SkillOption[]
}

export default function SkillSelector({ skills }: SkillSelectorProps) {
  const [selected, setSelected] = useState<string[]>([])

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {skills.map((skill) => {
        const active = selected.includes(skill.id)
        return (
          <button key={skill.id} onClick={() => setSelected((value) => active ? value.filter((item) => item !== skill.id) : [...value, skill.id])} className={`rounded-lg border p-5 text-center ${active ? 'border-primary bg-violet-50 text-tertiary' : 'border-outline-variant bg-white text-on-surface-variant'}`}>
            <span className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full ${active ? 'bg-tertiary text-white' : 'bg-white border border-outline-variant text-tertiary'}`}><span className="material-symbols-outlined">{skill.icon}</span></span>
            <span className="font-semibold">{skill.label}</span>
          </button>
        )
      })}
    </div>
  )
}

import Link from 'next/link'
import type { PracticeSkill } from '../_types/practice'
import ProgressBar from './ProgressBar'

type SkillCardProps = {
  skill: PracticeSkill
}

const toneClasses = {
  blue: 'bg-blue-50 text-primary border-blue-100',
  green: 'bg-emerald-50 text-secondary border-emerald-100',
  purple: 'bg-violet-50 text-tertiary border-violet-100',
}

export default function SkillCard({ skill }: SkillCardProps) {
  return (
    <Link href={skill.href} className="group rounded-lg border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-[0_4px_18px_-8px_rgba(15,23,42,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-18px_rgba(15,23,42,0.45)]">
      <div className="flex items-start justify-between gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg border ${toneClasses[skill.tone]}`}>
          <span className="material-symbols-outlined text-3xl">{skill.icon}</span>
        </div>
        <span className="material-symbols-outlined text-primary transition-transform group-hover:translate-x-1">arrow_forward</span>
      </div>

      <h2 className="mt-6 text-2xl font-bold text-on-surface">{skill.title}</h2>
      <p className="mt-2 min-h-14 text-sm leading-6 text-on-surface-variant">{skill.description}</p>

      <div className="mt-6 flex items-center gap-3">
        <ProgressBar value={skill.progressPercent} />
        <span className="w-10 text-right text-sm font-semibold text-primary">{skill.progressPercent}%</span>
      </div>
    </Link>
  )
}

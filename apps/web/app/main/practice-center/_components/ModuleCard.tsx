import Link from 'next/link'
import type { PracticeModule } from '../_types/practice'
import { getModuleHref } from '../_data/practice-content'
import ProgressBar from './ProgressBar'

type ModuleCardProps = {
  module: PracticeModule
}

export default function ModuleCard({ module }: ModuleCardProps) {
  const isCompleted = module.status === 'completed'
  const isInProgress = module.status === 'inProgress'
  const isLocked = module.status === 'locked'
  const tone = isCompleted ? 'success' : isLocked ? 'muted' : 'primary'
  const topBorder = isCompleted ? 'border-t-[#007a4d]' : isInProgress ? 'border-t-primary' : 'border-t-outline-variant'
  const badgeClass = isCompleted ? 'bg-emerald-100 text-[#007a4d]' : isInProgress ? 'bg-blue-100 text-primary' : 'bg-surface-container-high text-outline'
  const href = getModuleHref(module)

  return (
    <article className={`rounded-lg border border-outline-variant/60 border-t-4 ${topBorder} bg-surface-container-lowest p-6 shadow-[0_6px_22px_-18px_rgba(15,23,42,0.5)] ${isLocked ? 'opacity-65' : ''}`}>
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${badgeClass}`}>Module {module.order}</span>
            {isCompleted ? (
              <span className="flex items-center gap-1 text-xs font-medium text-[#007a4d]">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Completed
              </span>
            ) : null}
            {isInProgress ? (
              <span className="flex items-center gap-1 text-xs font-medium text-primary">
                <span className="material-symbols-outlined text-sm">trending_up</span>
                In Progress
              </span>
            ) : null}
          </div>
          <h2 className={`text-2xl font-bold ${isLocked ? 'text-outline' : 'text-on-surface'}`}>
            {isLocked ? <span className="material-symbols-outlined mr-2 align-[-3px] text-lg">lock</span> : null}
            {module.title}
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-on-surface-variant">{module.description}</p>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3 md:w-52">
          {isLocked ? (
            <div className="ml-auto flex h-9 min-w-32 items-center justify-center gap-1 rounded-lg bg-surface-container-high px-4 text-sm font-semibold text-outline">
              <span className="material-symbols-outlined text-sm">lock</span>
              Locked
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <ProgressBar value={module.progressPercent} tone={tone} />
                <span className={`w-11 text-right text-sm font-semibold ${isCompleted ? 'text-on-surface-variant' : 'text-primary'}`}>{module.progressPercent}%</span>
              </div>
              <Link href={href} className={`flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors ${isCompleted ? 'border-primary bg-white text-primary hover:bg-blue-50' : 'border-primary bg-primary text-white hover:bg-[#0047bb]'}`}>
                <span className="material-symbols-outlined text-base">{isCompleted ? 'replay' : 'arrow_forward'}</span>
                {isCompleted ? 'Review' : 'Continue'}
              </Link>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

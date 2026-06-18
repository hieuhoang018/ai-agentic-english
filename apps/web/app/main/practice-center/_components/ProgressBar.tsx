import { clampProgress } from '../_utils/progress'

type ProgressBarProps = {
  value: number
  tone?: 'primary' | 'success' | 'muted'
  className?: string
}

const toneClass = {
  primary: 'bg-primary',
  success: 'bg-[#007a4d]',
  muted: 'bg-outline',
}

export default function ProgressBar({ value, tone = 'primary', className = '' }: ProgressBarProps) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-surface-variant ${className}`}>
      <div className={`h-full rounded-full ${toneClass[tone]}`} style={{ width: `${clampProgress(value)}%` }} />
    </div>
  )
}

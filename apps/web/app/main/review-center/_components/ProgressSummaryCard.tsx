type ProgressSummaryCardProps = {
  label: string
  current: string
  value: number
  tone?: string
}

export default function ProgressSummaryCard({ label, current, value, tone = 'bg-primary' }: ProgressSummaryCardProps) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold text-primary">{current}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-variant">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

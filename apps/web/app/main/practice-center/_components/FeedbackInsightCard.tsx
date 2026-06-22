type FeedbackInsightCardProps = {
  title: string
  issue: string
  suggestion: string
}

export default function FeedbackInsightCard({ title, issue, suggestion }: FeedbackInsightCardProps) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-left text-sm leading-6 text-on-surface">
      <p className="mb-2 flex items-center gap-2 font-bold text-on-surface-variant">
        <span className="material-symbols-outlined text-base text-error">error</span>
        {title}
      </p>
      <p>{issue}</p>
      <div className="mt-3 rounded border border-outline-variant bg-white px-3 py-2 font-semibold text-secondary">
        ✓ {suggestion}
      </div>
    </div>
  )
}

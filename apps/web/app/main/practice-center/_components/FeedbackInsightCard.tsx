type FeedbackInsightCardProps = {
  title: string
  issue: string
  suggestion?: string
}

export default function FeedbackInsightCard({ title, issue, suggestion }: FeedbackInsightCardProps) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-left text-sm leading-6 text-on-surface dark:border-red-900/50 dark:bg-red-900/20 dark:text-on-primary">
      <p className="mb-2 flex items-center gap-2 font-bold text-on-surface-variant dark:text-surface-dim">
        <span className="material-symbols-outlined text-base text-error dark:text-red-400">error</span>
        {title}
      </p>
      <p>{issue}</p>
      {suggestion ? (
        <div className="mt-3 rounded border border-outline-variant bg-white px-3 py-2 font-semibold text-secondary dark:border-outline dark:bg-surface-dark-high">
          ✓ {suggestion}
        </div>
      ) : null}
    </div>
  )
}
